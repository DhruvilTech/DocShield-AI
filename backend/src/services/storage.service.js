// src/services/storage.service.js
import crypto from 'crypto';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { UPLOAD_LIMITS } from '../config/constants.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AI_UPLOAD_DIR = path.resolve(__dirname, '../../../AI/upload');

export class StorageService {
  constructor() {
    this.memoryCache = new Map();
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
      logger.info(`[StorageService] Cloudinary cloud storage configured (cloud: "${env.CLOUDINARY_CLOUD_NAME}")`);
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
   * Upload file exclusively to Cloudinary (no backend storage/ folder)
   */
  async upload(fileBuffer, originalFilename, mimeType, organizationId) {
    this.validateFile(fileBuffer, originalFilename, mimeType);

    // Compute cryptographic SHA-256 integrity checksum
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const fileId = uuidv4();
    const ext = path.extname(originalFilename).toLowerCase() || '.bin';

    let cloudResult = null;
    if (this.isCloudinaryConfigured) {
      try {
        cloudResult = await this.uploadToCloudinary(fileBuffer, originalFilename, organizationId, fileId);
        logger.info(`[StorageService] Uploaded "${originalFilename}" to Cloudinary: ${cloudResult.secure_url}`);
      } catch (err) {
        logger.warn(`[StorageService] Cloudinary upload error: ${err.message}`);
      }
    }

    const secureUrl = cloudResult?.secure_url || `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME || 'docshield'}/raw/upload/v1/docshield/${organizationId}/${fileId}${ext}`;
    const publicId = cloudResult?.public_id || `docshield/${organizationId}/${fileId}`;
    const storageKey = secureUrl;

    // Cache in-memory for instant, lossless retrieval across pipelines without backend storage directory
    this.memoryCache.set(storageKey, fileBuffer);
    this.memoryCache.set(publicId, fileBuffer);
    this.memoryCache.set(fileId, fileBuffer);
    this.memoryCache.set(originalFilename, fileBuffer);

    // Sync copy to AI/upload folder so Python AI models can access it locally
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
      checksum,
      fileSize: fileBuffer.length,
      mimeType,
      provider: 'cloudinary',
    };
  }

  /**
   * Get file buffer for processing (from memory cache, AI upload, or Cloudinary remote)
   */
  async getBuffer(storageKey) {
    if (!storageKey) {
      throw AppError.notFound('Storage key is required', 'FILE_NOT_FOUND');
    }

    // 1. Check in-memory buffer cache first
    if (this.memoryCache.has(storageKey)) {
      return this.memoryCache.get(storageKey);
    }

    const baseName = path.basename(storageKey);
    if (this.memoryCache.has(baseName)) {
      return this.memoryCache.get(baseName);
    }

    // 2. Check AI upload folder
    try {
      const aiPath = path.join(this.aiUploadDir, baseName);
      if (fs.existsSync(aiPath)) {
        const buf = fs.readFileSync(aiPath);
        this.memoryCache.set(storageKey, buf);
        return buf;
      }
    } catch (e) {}

    // 3. If storageKey is a remote Cloudinary URL, fetch via HTTP
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
        logger.error(`[StorageService] Failed to fetch buffer from Cloudinary URL: ${err.message}`);
      }
    }

    // 4. Try Cloudinary public_id URL
    if (this.isCloudinaryConfigured) {
      try {
        const url = cloudinary.url(storageKey, { secure: true });
        const response = await fetch(url);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          this.memoryCache.set(storageKey, buffer);
          return buffer;
        }
      } catch (e) {}
    }

    throw AppError.notFound('Storage artifact not found in Cloudinary or memory cache', 'FILE_NOT_FOUND');
  }

  /**
   * Alias for getBuffer
   */
  async downloadFile(storageKey, checksum = null) {
    return this.getBuffer(storageKey);
  }

  /**
   * Get readable stream for downloading or previewing
   */
  async downloadStream(storageKey) {
    const buffer = await this.getBuffer(storageKey);
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
