// src/services/storage.service.js
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { AppError } from '../errors/AppError.js';
import { UPLOAD_LIMITS } from '../config/constants.js';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_BASE_DIR = path.resolve(__dirname, '../../storage');

// Ensure base storage directory exists for offline/fallback caching
if (!fs.existsSync(STORAGE_BASE_DIR)) {
  fs.mkdirSync(STORAGE_BASE_DIR, { recursive: true });
}

export class StorageService {
  constructor(baseDir = STORAGE_BASE_DIR) {
    this.baseDir = baseDir;
    this.isCloudinaryConfigured = false;
    this.initCloudinary();
  }

  initCloudinary() {
    if (env.CLOUDINARY_URL) {
      cloudinary.config({
        cloudinary_url: env.CLOUDINARY_URL,
        secure: env.CLOUDINARY_SECURE !== false,
      });
      this.isCloudinaryConfigured = true;
    } else if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
      cloudinary.config({
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY,
        api_secret: env.CLOUDINARY_API_SECRET,
        secure: env.CLOUDINARY_SECURE !== false,
      });
      this.isCloudinaryConfigured = true;
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
   * Upload file to Cloudinary (or local enclave storage if Cloudinary is not configured)
   */
  async upload(fileBuffer, originalFilename, mimeType, organizationId) {
    this.validateFile(fileBuffer, originalFilename, mimeType);

    // Compute cryptographic SHA-256 integrity checksum
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const ext = path.extname(originalFilename).toLowerCase() || '.bin';
    const fileId = uuidv4();

    // 1. Cloudinary upload if configured
    if (this.isCloudinaryConfigured && env.NODE_ENV !== 'test') {
      try {
        const publicId = `docshield/organizations/${organizationId}/documents/${fileId}`;
        const resourceType = mimeType.startsWith('image/') ? 'image' : 'raw';

        const uploadPromise = new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              public_id: publicId,
              resource_type: resourceType,
              folder: undefined,
              overwrite: true,
              tags: [`org_${organizationId}`, 'docshield_document'],
            },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );

          const stream = Readable.from(fileBuffer);
          stream.pipe(uploadStream);
        });

        const result = await uploadPromise;

        // Also write a local copy to cache/offline storage for fast text extraction
        const localRelKey = path.join(organizationId, `${fileId}${ext}`).replace(/\\/g, '/');
        const localAbsPath = this.getSafePath(localRelKey);
        const orgDir = path.dirname(localAbsPath);
        if (!fs.existsSync(orgDir)) {
          fs.mkdirSync(orgDir, { recursive: true });
        }
        await fs.promises.writeFile(localAbsPath, fileBuffer);

        return {
          storageKey: result.public_id || publicId,
          secureUrl: result.secure_url,
          checksum,
          fileSize: fileBuffer.length,
          mimeType,
          provider: 'cloudinary',
        };
      } catch (err) {
        console.error('Cloudinary upload error, using secure local fallback:', err);
      }
    }

    // 2. Local fallback storage
    const relativeKey = path.join(organizationId, `${fileId}${ext}`).replace(/\\/g, '/');
    const absolutePath = this.getSafePath(relativeKey);

    const orgDir = path.dirname(absolutePath);
    if (!fs.existsSync(orgDir)) {
      fs.mkdirSync(orgDir, { recursive: true });
    }

    await fs.promises.writeFile(absolutePath, fileBuffer);

    return {
      storageKey: relativeKey,
      checksum,
      fileSize: fileBuffer.length,
      mimeType,
      provider: 'local',
    };
  }

  /**
   * Get readable stream for downloading or processing
   */
  async downloadStream(storageKey) {
    // 1. Check local filesystem first (cached or stored)
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
      // Not on local filesystem or invalid relative path
    }

    // 2. Try fetching from Cloudinary if configured
    if (this.isCloudinaryConfigured) {
      try {
        const url = cloudinary.url(storageKey, { resource_type: 'auto', secure: true });
        const response = await fetch(url);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          return {
            stream: Readable.from(buffer),
            size: buffer.length,
          };
        }
      } catch (err) {
        console.error('Failed to stream from Cloudinary:', err);
      }
    }

    throw AppError.notFound('Storage artifact not found', 'FILE_NOT_FOUND');
  }

  /**
   * Get file buffer for processing
   */
  async getBuffer(storageKey) {
    try {
      const absolutePath = this.getSafePath(storageKey);
      if (fs.existsSync(absolutePath)) {
        return await fs.promises.readFile(absolutePath);
      }
    } catch (e) {}

    if (this.isCloudinaryConfigured) {
      const url = cloudinary.url(storageKey, { resource_type: 'auto', secure: true });
      const response = await fetch(url);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
    }

    throw AppError.notFound('Storage artifact not found', 'FILE_NOT_FOUND');
  }

  /**
   * Alias for getBuffer
   */
  async downloadFile(storageKey, checksum = null) {
    return this.getBuffer(storageKey);
  }

  /**
   * Delete file from storage
   */
  async delete(storageKey) {
    // Delete from Cloudinary
    if (this.isCloudinaryConfigured && storageKey.startsWith('docshield/')) {
      try {
        await cloudinary.uploader.destroy(storageKey, { resource_type: 'raw' });
        await cloudinary.uploader.destroy(storageKey, { resource_type: 'image' });
      } catch (err) {
        // Ignore deletion errors
      }
    }

    // Delete local file if exists
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
      if (fs.existsSync(absolutePath)) return true;
    } catch (err) {}

    if (this.isCloudinaryConfigured && storageKey.startsWith('docshield/')) {
      try {
        const res = await cloudinary.api.resource(storageKey);
        return Boolean(res);
      } catch (err) {
        return false;
      }
    }

    return false;
  }
}

export const storageService = new StorageService();
