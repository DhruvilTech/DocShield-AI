// src/services/security/documentEncryption.service.js
import crypto from 'crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import logger from '../../utils/logger.js';

export class DocumentEncryptionService {
  constructor() {
    this.defaultKeyVersion = 'v1';
  }

  /**
   * Resolves a 256-bit (32-byte) Buffer key from an environment variable, hex string, or explicit key.
   * @param {string|Buffer} [customKey] - Optional custom key for testing or key rotation.
   * @returns {Buffer} 32-byte cryptographic key Buffer.
   */
  resolveKey(customKey = null) {
    const rawKey = customKey || env.DOC_ENCRYPTION_KEY || process.env.DOC_ENCRYPTION_KEY || 'c3ab8e6f10274a589dc2e4b8593a1df048291be059c3817f649204859a1bcdef';

    if (Buffer.isBuffer(rawKey)) {
      if (rawKey.length === 32) return rawKey;
      return crypto.createHash('sha256').update(rawKey).digest();
    }

    if (typeof rawKey === 'string') {
      const cleanKey = rawKey.trim();
      // If 64 hex characters, parse as 32-byte hex buffer
      if (/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
        return Buffer.from(cleanKey, 'hex');
      }
      // If 32-character utf8 string
      if (Buffer.byteLength(cleanKey, 'utf8') === 32) {
        return Buffer.from(cleanKey, 'utf8');
      }
      // Otherwise, deterministically derive a secure 256-bit key via SHA-256
      return crypto.createHash('sha256').update(cleanKey, 'utf8').digest();
    }

    throw AppError.internalServerError('Invalid document encryption key format');
  }

  /**
   * Computes SHA-256 document fingerprint/integrity checksum from plaintext bytes.
   * @param {Buffer} plaintextBuffer - Raw original document bytes.
   * @returns {string} Hexadecimal SHA-256 hash.
   */
  computeChecksum(plaintextBuffer) {
    if (!plaintextBuffer || !Buffer.isBuffer(plaintextBuffer)) {
      throw AppError.badRequest('Plaintext payload must be a non-empty Buffer', 'INVALID_BUFFER');
    }
    return crypto.createHash('sha256').update(plaintextBuffer).digest('hex').toLowerCase();
  }

  /**
   * Encrypts a plaintext document buffer using AES-256-GCM.
   * 
   * @param {Buffer} plaintextBuffer - Original plaintext file content.
   * @param {Object} [options] - Optional encryption parameters (customKey, keyVersion).
   * @returns {Object} Encrypted result containing ciphertextBuffer, iv, authTag, algorithm, keyVersion, checksum.
   */
  encryptDocument(plaintextBuffer, options = {}) {
    if (!plaintextBuffer || plaintextBuffer.length === 0) {
      throw AppError.badRequest('Cannot encrypt empty document payload', 'EMPTY_PAYLOAD');
    }

    const key = this.resolveKey(options.customKey);
    const keyVersion = options.keyVersion || this.defaultKeyVersion;

    // 1. Calculate SHA-256 fingerprint on original plaintext bytes before encryption
    const checksum = this.computeChecksum(plaintextBuffer);

    // 2. Generate cryptographically secure random 12-byte IV (nonce)
    const iv = crypto.randomBytes(12);

    // 3. Initialize AES-256-GCM cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    // 4. Encrypt plaintext
    const ciphertextBuffer = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);

    // 5. Extract 16-byte GCM authentication tag
    const authTag = cipher.getAuthTag();

    return {
      ciphertextBuffer,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: 'AES-256-GCM',
      keyVersion,
      checksum,
      plaintextSize: plaintextBuffer.length,
      ciphertextSize: ciphertextBuffer.length,
    };
  }

  /**
   * Decrypts an AES-256-GCM encrypted document buffer and validates integrity.
   * 
   * @param {Buffer} ciphertextBuffer - Encrypted ciphertext bytes.
   * @param {string} ivHex - Hex-encoded 12-byte initialization vector.
   * @param {string} authTagHex - Hex-encoded 16-byte GCM authentication tag.
   * @param {string} [expectedChecksum] - Optional expected plaintext SHA-256 checksum to verify.
   * @param {Object} [options] - Optional custom decryption settings (customKey).
   * @returns {Buffer} Decrypted and authenticated original plaintext buffer.
   */
  decryptDocument(ciphertextBuffer, ivHex, authTagHex, expectedChecksum = null, options = {}) {
    if (!ciphertextBuffer || ciphertextBuffer.length === 0) {
      throw AppError.badRequest('Ciphertext buffer is empty or missing', 'EMPTY_CIPHERTEXT');
    }
    if (!ivHex || typeof ivHex !== 'string') {
      throw AppError.badRequest('Encryption initialization vector (IV) is missing or invalid', 'INVALID_IV');
    }
    if (!authTagHex || typeof authTagHex !== 'string') {
      throw AppError.badRequest('Encryption authentication tag is missing or invalid', 'INVALID_AUTH_TAG');
    }

    const key = this.resolveKey(options.customKey);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    if (iv.length !== 12) {
      throw AppError.badRequest('Invalid IV length: AES-GCM requires exactly 12 bytes', 'INVALID_IV_LENGTH');
    }
    if (authTag.length !== 16) {
      throw AppError.badRequest('Invalid Auth Tag length: AES-GCM requires exactly 16 bytes', 'INVALID_AUTH_TAG_LENGTH');
    }

    // 1. Initialize AES-256-GCM decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    // 2. Decrypt ciphertext & authenticate GCM tag
    let plaintextBuffer;
    try {
      plaintextBuffer = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);
    } catch (err) {
      logger.error(`[DocumentEncryption] AES-256-GCM decryption failed: ${err.message}`);
      throw AppError.badRequest(
        'Document decryption failed: Authentication tag mismatch, wrong key, or corrupted ciphertext',
        'DECRYPTION_AUTH_FAILED'
      );
    }

    // 3. Verify SHA-256 integrity fingerprint against expected checksum
    if (expectedChecksum) {
      const actualChecksum = this.computeChecksum(plaintextBuffer);
      if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
        logger.error(`[DocumentEncryption] SHA-256 integrity mismatch. Expected ${expectedChecksum}, got ${actualChecksum}`);
        throw AppError.badRequest(
          'Document integrity verification failed: Plaintext SHA-256 checksum mismatch',
          'CHECKSUM_INTEGRITY_MISMATCH'
        );
      }
    }

    return plaintextBuffer;
  }
}

export const documentEncryptionService = new DocumentEncryptionService();
