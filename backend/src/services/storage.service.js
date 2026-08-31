// src/services/storage.service.js
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { AppError } from '../errors/AppError.js';
import { UPLOAD_LIMITS } from '../config/constants.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Backend local tenant-isolated storage
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
   * Upload file to 100% Local On-Premise Secure Enclave storage.
   * Stores in backend isolated storage and the single unified AI/upload/ folder.
   */
  async upload(fileBuffer, originalFilename, mimeType, organizationId) {
    this.validateFile(fileBuffer, originalFilename, mimeType);

    // Compute cryptographic SHA-256 integrity checksum
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const ext = path.extname(originalFilename).toLowerCase() || '.bin';
    const fileId = uuidv4();

    // 1. Write to backend tenant-isolated storage: storage/<organizationId>/<fileId><ext>
    const relativeKey = path.join(organizationId, `${fileId}${ext}`).replace(/\\/g, '/');
    const absolutePath = this.getSafePath(relativeKey);
    const orgDir = path.dirname(absolutePath);
    if (!fs.existsSync(orgDir)) {
      await fs.promises.mkdir(orgDir, { recursive: true });
    }
    await fs.promises.writeFile(absolutePath, fileBuffer);

    // 2. Write to single AI upload folder: AI/upload/<originalFilename>
    try {
      if (!fs.existsSync(this.aiUploadDir)) {
        await fs.promises.mkdir(this.aiUploadDir, { recursive: true });
      }
      const aiFilePath = path.join(this.aiUploadDir, originalFilename);
      await fs.promises.writeFile(aiFilePath, fileBuffer);
    } catch (e) {
      logger.warn(`Could not save copy to AI/upload: ${e.message}`);
    }

    logger.info(`[StorageService] Stored "${originalFilename}" locally in enclave: ${relativeKey}`);

    return {
      storageKey: relativeKey,
      secureUrl: `/api/v1/documents/files/${relativeKey}`,
      checksum,
      fileSize: fileBuffer.length,
      mimeType,
      provider: 'local_secure_storage',
    };
  }

  /**
   * Get readable stream for downloading or processing from local enclave
   */
  async downloadStream(storageKey) {
    try {
      const absolutePath = this.getSafePath(storageKey);
      if (fs.existsSync(absolutePath)) {
        const stat = await fs.promises.stat(absolutePath);
        const stream = fs.createReadStream(absolutePath);
        return {
          stream,
          size: stat.size,
        };
      }
    } catch (e) {
      // Check fallback in single AI upload folder
      const fallbackPath = path.join(this.aiUploadDir, path.basename(storageKey));
      if (fs.existsSync(fallbackPath)) {
        const stat = await fs.promises.stat(fallbackPath);
        const stream = fs.createReadStream(fallbackPath);
        return {
          stream,
          size: stat.size,
        };
      }
    }

    throw AppError.notFound('Storage artifact not found in local enclave', 'FILE_NOT_FOUND');
  }

  /**
   * Get file buffer for processing from local storage
   */
  async getBuffer(storageKey) {
    try {
      const absolutePath = this.getSafePath(storageKey);
      if (fs.existsSync(absolutePath)) {
        return await fs.promises.readFile(absolutePath);
      }
    } catch (e) {}

    // Fallback check in AI upload
    const aiFallback = path.join(this.aiUploadDir, path.basename(storageKey));
    if (fs.existsSync(aiFallback)) {
      return await fs.promises.readFile(aiFallback);
    }

    throw AppError.notFound('Storage artifact not found in local enclave', 'FILE_NOT_FOUND');
  }

  /**
   * Alias for getBuffer
   */
  async downloadFile(storageKey, checksum = null) {
    return this.getBuffer(storageKey);
  }

  /**
   * Delete file from local storage
   */
  async delete(storageKey) {
    try {
      const absolutePath = this.getSafePath(storageKey);
      if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);
      }
    } catch (err) {
      // Ignore if already deleted
    }
  }

  /**
   * Check if file exists in local storage
   */
  async exists(storageKey) {
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
