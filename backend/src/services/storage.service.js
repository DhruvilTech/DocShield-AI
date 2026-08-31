// src/services/storage.service.js
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { UPLOAD_LIMITS } from '../config/constants.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Backend local tenant-isolated storage cache
const BACKEND_STORAGE_DIR = path.resolve(__dirname, '../../storage');

// 2. Single unified AI upload directory: DocShield-AI/AI/upload/
const AI_UPLOAD_DIR = path.resolve(__dirname, '../../../AI/upload');

// Ensure storage directories exist
[BACKEND_STORAGE_DIR, AI_UPLOAD_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

export class StorageService {
  constructor(baseDir = BACKEND_STORAGE_DIR) {
    this.baseDir = baseDir;
    this.aiUploadDir = AI_UPLOAD_DIR;

    // Configure Cloudinary SDK
    this.isCloudinaryConfigured = Boolean(
      (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) ||
      env.CLOUDINARY_URL
    );

    if (this.isCloudinaryConfigured) {
      cloudinary.config({
        cloud_name: env.CLOUDINARY_CLOUD_NAME || 'docshield',
        api_key: env.CLOUDINARY_API_KEY,
        api_secret: env.CLOUDINARY_API_SECRET,
        secure: true,
      });
      logger.info(`[StorageService] Cloudinary cloud storage initialized for cloud: "${env.CLOUDINARY_CLOUD_NAME || 'docshield'}"`);
    } else {
      logger.warn('[StorageService] Cloudinary credentials not fully supplied; fallback to local enclave storage.');
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
   * Resolve safe absolute filesystem path and prevent directory traversal
   */
  getSafePath(storageKey) {
    const cleanKey = storageKey.replace(/\\/g, '/').replace(/^\/+/, '');
    const resolvedPath = path.resolve(this.baseDir, cleanKey);

    if (!resolvedPath.startsWith(this.baseDir)) {
      throw AppError.forbidden('Invalid storage path or traversal attempt detected', 'PATH_TRAVERSAL_DETECTED');
    }

    return resolvedPath;
  }

  /**
   * Upload buffer directly to Cloudinary
   */
  async uploadToCloudinary(fileBuffer, originalFilename, organizationId, fileId) {
    return new Promise((resolve, reject) => {
      const ext = path.extname(originalFilename).toLowerCase();
      const isPdf = ext === '.pdf';

      const uploadOptions = {
        folder: `docshield/${organizationId}`,
        public_id: `${fileId}`,
        resource_type: isPdf ? 'raw' : 'auto',
        overwrite: true,
      };

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            logger.error(`[StorageService] Cloudinary upload stream error: ${error.message}`);
            return reject(error);
          }
          resolve(result);
        }
      );

      const stream = Readable.from(fileBuffer);
      stream.pipe(uploadStream);
    });
  }

  /**
   * Upload file to Cloudinary Cloud Vault (with local cache sync for AI execution)
   */
  async upload(fileBuffer, originalFilename, mimeType, organizationId) {
    this.validateFile(fileBuffer, originalFilename, mimeType);

    // Compute cryptographic SHA-256 integrity checksum
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const ext = path.extname(originalFilename).toLowerCase() || '.bin';
    const fileId = uuidv4();

    // 1. Sync copy to backend tenant storage: storage/<organizationId>/<fileId><ext>
    const relativeKey = path.join(organizationId, `${fileId}${ext}`).replace(/\\/g, '/');
    const absolutePath = this.getSafePath(relativeKey);
    const orgDir = path.dirname(absolutePath);
    if (!fs.existsSync(orgDir)) {
      await fs.promises.mkdir(orgDir, { recursive: true });
    }
    await fs.promises.writeFile(absolutePath, fileBuffer);

    // 2. Sync copy to single AI upload folder: AI/upload/<originalFilename>
    try {
      if (!fs.existsSync(this.aiUploadDir)) {
        await fs.promises.mkdir(this.aiUploadDir, { recursive: true });
      }
      const aiFilePath = path.join(this.aiUploadDir, originalFilename);
      await fs.promises.writeFile(aiFilePath, fileBuffer);
    } catch (e) {
      logger.warn(`Could not save copy to AI/upload: ${e.message}`);
    }

    // 3. Upload to Cloudinary
    let cloudResult = null;
    if (this.isCloudinaryConfigured) {
      try {
        cloudResult = await this.uploadToCloudinary(fileBuffer, originalFilename, organizationId, fileId);
        logger.info(`[StorageService] Uploaded "${originalFilename}" to Cloudinary: ${cloudResult.secure_url}`);
      } catch (err) {
        logger.warn(`[StorageService] Cloudinary remote upload failed: ${err.message}. Retaining local enclave storage.`);
      }
    }

    const secureUrl = cloudResult?.secure_url || `/api/v1/documents/files/${relativeKey}`;
    const storageKey = cloudResult?.secure_url || relativeKey;

    return {
      storageKey,
      secureUrl,
      publicId: cloudResult?.public_id || relativeKey,
      checksum,
      fileSize: fileBuffer.length,
      mimeType,
      provider: cloudResult ? 'cloudinary' : 'local_secure_storage',
    };
  }

  /**
   * Get file buffer for processing (from local cache or Cloudinary remote)
   */
  async getBuffer(storageKey) {
    if (!storageKey) {
      throw AppError.notFound('Storage key is required', 'FILE_NOT_FOUND');
    }

    // 1. If key is a local relative path, try reading directly
    if (!storageKey.startsWith('http://') && !storageKey.startsWith('https://')) {
      try {
        const absolutePath = this.getSafePath(storageKey);
        if (fs.existsSync(absolutePath)) {
          return await fs.promises.readFile(absolutePath);
        }
      } catch (e) {}
    }

    // 2. Try looking up in local storage directories by filename or basename
    const baseName = path.basename(storageKey);
    const aiFallback = path.join(this.aiUploadDir, baseName);
    if (fs.existsSync(aiFallback)) {
      return await fs.promises.readFile(aiFallback);
    }

    // 3. If storageKey is a remote Cloudinary URL, fetch via HTTP
    if (storageKey.startsWith('http://') || storageKey.startsWith('https://')) {
      try {
        const response = await fetch(storageKey);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Cache in AI upload directory
        try {
          if (!fs.existsSync(aiFallback)) {
            await fs.promises.writeFile(aiFallback, buffer);
          }
        } catch {}

        return buffer;
      } catch (err) {
        logger.error(`[StorageService] Failed to fetch buffer from Cloudinary URL: ${err.message}`);
      }
    }

    throw AppError.notFound('Storage artifact not found in Cloudinary or local storage', 'FILE_NOT_FOUND');
  }

  /**
   * Alias for getBuffer
   */
  async downloadFile(storageKey, checksum = null) {
    return this.getBuffer(storageKey);
  }

  /**
   * Get readable stream for downloading or processing
   */
  async downloadStream(storageKey) {
    const buffer = await this.getBuffer(storageKey);
    return {
      stream: Readable.from(buffer),
      size: buffer.length,
    };
  }

  /**
   * Delete file from Cloudinary and local storage
   */
  async delete(storageKey) {
    if (!storageKey) return;

    // 1. Delete from Cloudinary if remote URL / public_id
    if (this.isCloudinaryConfigured && (storageKey.includes('cloudinary') || storageKey.startsWith('docshield/'))) {
      try {
        // Extract public_id
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

    // 2. Unlink local file
    try {
      if (!storageKey.startsWith('http://') && !storageKey.startsWith('https://')) {
        const absolutePath = this.getSafePath(storageKey);
        if (fs.existsSync(absolutePath)) {
          await fs.promises.unlink(absolutePath);
        }
      }
    } catch (err) {}
  }

  /**
   * Check if file exists in Cloudinary or local storage
   */
  async exists(storageKey) {
    if (!storageKey) return false;
    if (storageKey.startsWith('http://') || storageKey.startsWith('https://')) {
      return true;
    }
    try {
      const absolutePath = this.getSafePath(storageKey);
      if (fs.existsSync(absolutePath)) return true;
    } catch (err) {}

    const aiFallback = path.join(this.aiUploadDir, path.basename(storageKey));
    if (fs.existsSync(aiFallback)) return true;

    return false;
  }
}

export const storageService = new StorageService();
