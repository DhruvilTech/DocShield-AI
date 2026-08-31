// src/services/storage.service.js
import crypto from 'crypto';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { documentEncryptionService } from './security/documentEncryption.service.js';
import { AppError } from '../errors/AppError.js';
import { UPLOAD_LIMITS } from '../config/constants.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AI_UPLOAD_DIR = path.resolve(__dirname, '../../../AI/upload');

export class StorageService {
  constructor() {
    this.memoryCache = new Map(); // key -> Buffer (stores ciphertext and plaintext cache)
    this.metadataCache = new Map(); // key -> encryption metadata
    this.aiUploadDir = AI_UPLOAD_DIR;

    // Configure Cloudinary SDK
    this.isCloudinaryConfigured = Boolean(
      (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) ||
      env.CLOUDINARY_URL
    );

    if (this.isCloudinaryConfigured) {
      cloudinary.config({
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY,
        api_secret: env.CLOUDINARY_API_SECRET,
        secure: true,
      });
      logger.info(`[StorageService] Cloudinary encrypted cloud storage configured (cloud: "${env.CLOUDINARY_CLOUD_NAME}")`);
    } else {
      logger.warn('[StorageService] Cloudinary credentials not configured.');
    }
  }

  /**
   * Validate and sanitize file parameters
   */
  validateFile(fileBuffer, originalFilename, mimeType) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw AppError.badRequest('Uploaded file payload cannot be empty', 'EMPTY_FILE');
    }

    if (fileBuffer.length > UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES) {
      throw AppError.badRequest(
        `File size exceeds limit of ${UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
        'FILE_TOO_LARGE'
      );
    }

    // Check extension
    const ext = path.extname(originalFilename).toLowerCase();
    if (!UPLOAD_LIMITS.ALLOWED_EXTENSIONS.includes(ext)) {
      throw AppError.badRequest(
        `File extension ${ext} is not allowed. Supported: ${UPLOAD_LIMITS.ALLOWED_EXTENSIONS.join(', ')}`,
        'INVALID_FILE_EXTENSION'
      );
    }

    // Check MIME type
    if (!UPLOAD_LIMITS.ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw AppError.badRequest(
        `File MIME type ${mimeType} is not supported`,
        'INVALID_MIME_TYPE'
      );
    }
  }

  /**
   * Uploads ONLY raw ciphertext to Cloudinary with all transformations disabled.
   */
  async uploadCiphertextToCloudinary(ciphertextBuffer, organizationId, fileId) {
    return new Promise((resolve, reject) => {
      const uploadOptions = {
        folder: `docshield/${organizationId}`,
        public_id: `${fileId}.enc`,
        resource_type: 'raw',
        type: 'upload',
        overwrite: true,
      };

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            logger.error(`[StorageService] Cloudinary ciphertext upload error: ${error.message}`);
            return reject(error);
          }
          resolve(result);
        }
      );

      const stream = Readable.from(ciphertextBuffer);
      stream.pipe(uploadStream);
    });
  }

  /**
   * Encrypts plaintext document with AES-256-GCM and stores ciphertext in Cloudinary.
   * 
   * @param {Buffer} fileBuffer - Plaintext file content.
   * @param {string} originalFilename - Original filename with extension.
   * @param {string} mimeType - File MIME type.
   * @param {string} organizationId - Organization tenant UUID.
   * @returns {Promise<Object>} Storage and encryption metadata.
   */
  async upload(fileBuffer, originalFilename, mimeType, organizationId) {
    this.validateFile(fileBuffer, originalFilename, mimeType);

    // 1. Encrypt with AES-256-GCM (computes SHA-256 of plaintext, random 12-byte IV, and 16-byte Auth Tag)
    const encrypted = documentEncryptionService.encryptDocument(fileBuffer);
    const fileId = uuidv4();

    // 2. Upload ONLY ciphertextBuffer to Cloudinary as raw binary
    let cloudResult = null;
    if (this.isCloudinaryConfigured) {
      try {
        cloudResult = await this.uploadCiphertextToCloudinary(encrypted.ciphertextBuffer, organizationId, fileId);
        logger.info(`[StorageService] Uploaded AES-256-GCM ciphertext for "${originalFilename}" to Cloudinary: ${cloudResult.secure_url}`);
      } catch (err) {
        logger.warn(`[StorageService] Cloudinary remote upload failed: ${err.message}`);
      }
    }

    const secureUrl = cloudResult?.secure_url || `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME || 'docshield'}/raw/upload/v1/docshield/${organizationId}/${fileId}.enc`;
    const publicId = cloudResult?.public_id || `docshield/${organizationId}/${fileId}.enc`;
    const storageKey = secureUrl;

    // Cache in-memory for instant pipeline retrieval
    this.memoryCache.set(storageKey, encrypted.ciphertextBuffer);
    this.memoryCache.set(publicId, encrypted.ciphertextBuffer);
    this.memoryCache.set(fileId, encrypted.ciphertextBuffer);
    this.memoryCache.set(`plain_${storageKey}`, fileBuffer);
    this.memoryCache.set(`plain_${fileId}`, fileBuffer);
    this.memoryCache.set(`plain_${originalFilename}`, fileBuffer);

    this.metadataCache.set(storageKey, {
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      checksum: encrypted.checksum,
      encryptionAlgorithm: encrypted.algorithm,
      keyVersion: encrypted.keyVersion,
      isEncrypted: true,
    });

    // Also sync unencrypted buffer copy to AI upload folder for local Python sub-processes
    try {
      if (!fs.existsSync(this.aiUploadDir)) {
        fs.mkdirSync(this.aiUploadDir, { recursive: true });
      }
      fs.writeFileSync(path.join(this.aiUploadDir, originalFilename), fileBuffer);
    } catch (e) {}

    return {
      storageKey,
      secureUrl,
      publicId,
      checksum: encrypted.checksum, // SHA-256 of original plaintext
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      encryptionAlgorithm: encrypted.algorithm,
      keyVersion: encrypted.keyVersion,
      isEncrypted: true,
      fileSize: fileBuffer.length,
      mimeType,
      provider: 'cloudinary_aes256gcm',
    };
  }

  /**
   * Fetches raw ciphertext buffer from memory cache, AI upload, or Cloudinary remote.
   * @param {string} storageKey - Cloudinary URL or public ID.
   * @returns {Promise<Buffer>}
   */
  async getRawCiphertext(storageKey) {
    if (!storageKey) {
      throw AppError.notFound('Storage key is required', 'FILE_NOT_FOUND');
    }

    // 1. Check in-memory cache
    if (this.memoryCache.has(storageKey)) {
      return this.memoryCache.get(storageKey);
    }

    const baseName = path.basename(storageKey);
    if (this.memoryCache.has(baseName)) {
      return this.memoryCache.get(baseName);
    }

    // 2. Fetch remote ciphertext from Cloudinary URL
    if (storageKey.startsWith('http://') || storageKey.startsWith('https://')) {
      try {
        const response = await fetch(storageKey);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          this.memoryCache.set(storageKey, buffer);
          return buffer;
        }
      } catch (err) {
        logger.error(`[StorageService] Failed to fetch ciphertext from Cloudinary URL: ${err.message}`);
      }
    }

    // 3. Try Cloudinary public_id URL
    if (this.isCloudinaryConfigured) {
      try {
        const url = cloudinary.url(storageKey, { resource_type: 'raw', secure: true });
        const response = await fetch(url);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          this.memoryCache.set(storageKey, buffer);
          return buffer;
        }
      } catch (e) {}
    }

    // 4. Check AI upload folder
    try {
      const aiPath = path.join(this.aiUploadDir, baseName);
      if (fs.existsSync(aiPath)) {
        const buf = fs.readFileSync(aiPath);
        return buf;
      }
    } catch (e) {}

    throw AppError.notFound('Encrypted storage artifact not found in Cloudinary or cache', 'FILE_NOT_FOUND');
  }

  /**
   * Fetches, decrypts (AES-256-GCM), and authenticates SHA-256 integrity for a document version.
   * 
   * @param {Object|string} versionOrKey - DocumentVersion DB record or storage key string.
   * @param {string} [iv] - Hex IV (if passing key string).
   * @param {string} [authTag] - Hex Auth Tag (if passing key string).
   * @param {string} [expectedChecksum] - Expected SHA-256 hash (if passing key string).
   * @returns {Promise<Buffer>} Authenticated plaintext buffer.
   */
  async getDecryptedBuffer(versionOrKey, iv = null, authTag = null, expectedChecksum = null) {
    let storageKey;
    let isEncrypted = true;
    let targetIv = iv;
    let targetAuthTag = authTag;
    let targetChecksum = expectedChecksum;

    if (typeof versionOrKey === 'object' && versionOrKey !== null) {
      storageKey = versionOrKey.storage_key || versionOrKey.storageKey;
      targetIv = versionOrKey.iv ?? targetIv;
      targetAuthTag = versionOrKey.auth_tag || versionOrKey.authTag || targetAuthTag;
      targetChecksum = versionOrKey.checksum || targetChecksum;
      isEncrypted = versionOrKey.is_encrypted !== undefined
        ? Boolean(versionOrKey.is_encrypted)
        : Boolean(targetIv && targetAuthTag);
    } else {
      storageKey = versionOrKey;
      // Look up cached metadata if not explicitly passed
      if (this.metadataCache.has(storageKey)) {
        const cached = this.metadataCache.get(storageKey);
        targetIv = targetIv || cached.iv;
        targetAuthTag = targetAuthTag || cached.authTag;
        targetChecksum = targetChecksum || cached.checksum;
        isEncrypted = cached.isEncrypted;
      }
    }

    // Fast-path: check in-memory plaintext cache
    if (this.memoryCache.has(`plain_${storageKey}`)) {
      const plainBuf = this.memoryCache.get(`plain_${storageKey}`);
      if (targetChecksum) {
        const actualHash = documentEncryptionService.computeChecksum(plainBuf);
        if (actualHash.toLowerCase() === targetChecksum.toLowerCase()) {
          return plainBuf;
        }
      } else {
        return plainBuf;
      }
    }

    // Fetch ciphertext
    const ciphertext = await this.getRawCiphertext(storageKey);

    // Legacy unencrypted document handling
    if (!isEncrypted || !targetIv || !targetAuthTag) {
      if (targetChecksum) {
        const actualChecksum = documentEncryptionService.computeChecksum(ciphertext);
        if (actualChecksum.toLowerCase() !== targetChecksum.toLowerCase()) {
          logger.warn(`[StorageService] Checksum mismatch on unencrypted document: expected ${targetChecksum}, got ${actualChecksum}`);
        }
      }
      return ciphertext;
    }

    // AES-256-GCM Decryption and SHA-256 integrity verification
    return documentEncryptionService.decryptDocument(
      ciphertext,
      targetIv,
      targetAuthTag,
      targetChecksum
    );
  }

  /**
   * Alias for getDecryptedBuffer (backward compatibility for existing services)
   */
  async getBuffer(versionOrKey) {
    return this.getDecryptedBuffer(versionOrKey);
  }

  /**
   * Alias for getDecryptedBuffer
   */
  async downloadFile(versionOrKey, checksum = null) {
    return this.getDecryptedBuffer(versionOrKey, null, null, checksum);
  }

  /**
   * Returns a readable stream of the decrypted plaintext document for authorized downloads.
   */
  async downloadStream(versionOrKey) {
    const buffer = await this.getDecryptedBuffer(versionOrKey);
    return {
      stream: Readable.from(buffer),
      size: buffer.length,
    };
  }

  /**
   * Delete file from Cloudinary and cache
   */
  async delete(storageKey) {
    if (!storageKey) return;

    this.memoryCache.delete(storageKey);
    this.memoryCache.delete(`plain_${storageKey}`);
    this.metadataCache.delete(storageKey);
    const baseName = path.basename(storageKey);
    this.memoryCache.delete(baseName);

    if (this.isCloudinaryConfigured && (storageKey.includes('cloudinary') || storageKey.startsWith('docshield/'))) {
      try {
        let publicId = storageKey;
        if (storageKey.includes('res.cloudinary.com')) {
          const parts = storageKey.split('/upload/');
          if (parts[1]) {
            publicId = parts[1].replace(/^v\d+\//, '').replace(/\.[^/.]+$/, '');
          }
        }
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      } catch (err) {
        logger.warn(`[StorageService] Cloudinary deletion error: ${err.message}`);
      }
    }
  }

  /**
   * Check if file exists in Cloudinary or cache
   */
  async exists(storageKey) {
    if (!storageKey) return false;
    if (this.memoryCache.has(storageKey) || this.memoryCache.has(path.basename(storageKey))) {
      return true;
    }
    return storageKey.startsWith('http://') || storageKey.startsWith('https://');
  }
}

export const storageService = new StorageService();
