// src/services/storage.service.js
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { AppError } from '../errors/AppError.js';
import { UPLOAD_LIMITS } from '../config/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_BASE_DIR = path.resolve(__dirname, '../../storage');

// Ensure base storage directory exists
if (!fs.existsSync(STORAGE_BASE_DIR)) {
  fs.mkdirSync(STORAGE_BASE_DIR, { recursive: true });
}

export class StorageService {
  constructor(baseDir = STORAGE_BASE_DIR) {
    this.baseDir = baseDir;
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
    // Normalize and check
    const cleanKey = storageKey.replace(/\\/g, '/').replace(/^\/+/, '');
    const resolvedPath = path.resolve(this.baseDir, cleanKey);

    if (!resolvedPath.startsWith(this.baseDir)) {
      throw AppError.forbidden('Invalid storage path or traversal attempt detected', 'PATH_TRAVERSAL_DETECTED');
    }

    return resolvedPath;
  }

  /**
   * Upload file to storage
   */
  async upload(fileBuffer, originalFilename, mimeType, organizationId) {
    this.validateFile(fileBuffer, originalFilename, mimeType);

    const ext = path.extname(originalFilename).toLowerCase() || '.bin';
    const fileId = uuidv4();
    const relativeKey = path.join(organizationId, `${fileId}${ext}`).replace(/\\/g, '/');
    const absolutePath = this.getSafePath(relativeKey);

    // Ensure org folder exists
    const orgDir = path.dirname(absolutePath);
    if (!fs.existsSync(orgDir)) {
      fs.mkdirSync(orgDir, { recursive: true });
    }

    // Calculate SHA-256 integrity checksum
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Write file to disk
    await fs.promises.writeFile(absolutePath, fileBuffer);

    return {
      storageKey: relativeKey,
      checksum,
      fileSize: fileBuffer.length,
      mimeType,
    };
  }

  /**
   * Get readable stream for downloading
   */
  async downloadStream(storageKey) {
    const absolutePath = this.getSafePath(storageKey);

    if (!fs.existsSync(absolutePath)) {
      throw AppError.notFound('Storage artifact not found on disk', 'FILE_NOT_FOUND');
    }

    const stat = await fs.promises.stat(absolutePath);
    const stream = fs.createReadStream(absolutePath);

    return {
      stream,
      size: stat.size,
    };
  }

  /**
   * Delete file from storage
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
   * Check if file exists
   */
  async exists(storageKey) {
    try {
      const absolutePath = this.getSafePath(storageKey);
      return fs.existsSync(absolutePath);
    } catch (err) {
      return false;
    }
  }
}

export const storageService = new StorageService();
