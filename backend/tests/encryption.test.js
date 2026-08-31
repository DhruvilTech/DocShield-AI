// tests/encryption.test.js
import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { documentEncryptionService } from '../src/services/security/documentEncryption.service.js';
import { storageService } from '../src/services/storage.service.js';

describe('Document AES-256-GCM Encryption & Integrity Verification Tests', () => {
  const originalPlaintext = Buffer.from(
    'CONFIDENTIAL PASSPORT DATA: Republic of India, Name: MAULIKKUMAR PATHAK, No: Z1234567, Exp: 2030-01-01',
    'utf-8'
  );

  it('should encrypt plaintext document with AES-256-GCM and generate valid IV, Auth Tag, and SHA-256', () => {
    const encrypted = documentEncryptionService.encryptDocument(originalPlaintext);

    assert.ok(encrypted.ciphertextBuffer, 'Ciphertext buffer must be present');
    assert.notDeepStrictEqual(encrypted.ciphertextBuffer, originalPlaintext, 'Ciphertext must not equal plaintext');
    assert.strictEqual(encrypted.algorithm, 'AES-256-GCM');
    assert.strictEqual(encrypted.keyVersion, 'v1');

    // IV must be 12 bytes (24 hex characters)
    assert.strictEqual(typeof encrypted.iv, 'string');
    assert.strictEqual(encrypted.iv.length, 24);

    // Auth Tag must be 16 bytes (32 hex characters)
    assert.strictEqual(typeof encrypted.authTag, 'string');
    assert.strictEqual(encrypted.authTag.length, 32);

    // SHA-256 Checksum
    const expectedChecksum = crypto.createHash('sha256').update(originalPlaintext).digest('hex');
    assert.strictEqual(encrypted.checksum, expectedChecksum);
    assert.strictEqual(encrypted.plaintextSize, originalPlaintext.length);
  });

  it('should decrypt ciphertext and restore exact original plaintext bytes with SHA-256 verification', () => {
    const encrypted = documentEncryptionService.encryptDocument(originalPlaintext);

    const decrypted = documentEncryptionService.decryptDocument(
      encrypted.ciphertextBuffer,
      encrypted.iv,
      encrypted.authTag,
      encrypted.checksum
    );

    assert.deepStrictEqual(decrypted, originalPlaintext, 'Decrypted bytes must match original plaintext');
    assert.strictEqual(decrypted.toString('utf-8'), originalPlaintext.toString('utf-8'));
  });

  it('should fail decryption if ciphertext is tampered or corrupted', () => {
    const encrypted = documentEncryptionService.encryptDocument(originalPlaintext);

    // Corrupt 1 byte in ciphertext
    const corruptedCiphertext = Buffer.from(encrypted.ciphertextBuffer);
    corruptedCiphertext[0] = corruptedCiphertext[0] ^ 0xff;

    assert.throws(
      () => {
        documentEncryptionService.decryptDocument(
          corruptedCiphertext,
          encrypted.iv,
          encrypted.authTag,
          encrypted.checksum
        );
      },
      (err) => {
        return err.code === 'DECRYPTION_AUTH_FAILED' || err.message.includes('decryption failed');
      },
      'Corrupted ciphertext must trigger decryption authentication failure'
    );
  });

  it('should fail decryption if authentication tag is tampered', () => {
    const encrypted = documentEncryptionService.encryptDocument(originalPlaintext);

    // Corrupt auth tag
    const tamperedTag = '00'.repeat(16);

    assert.throws(
      () => {
        documentEncryptionService.decryptDocument(
          encrypted.ciphertextBuffer,
          encrypted.iv,
          tamperedTag,
          encrypted.checksum
        );
      },
      (err) => {
        return err.code === 'DECRYPTION_AUTH_FAILED' || err.message.includes('decryption failed');
      },
      'Tampered Auth Tag must trigger decryption authentication failure'
    );
  });

  it('should fail decryption if an incorrect encryption key is supplied', () => {
    const encrypted = documentEncryptionService.encryptDocument(originalPlaintext);
    const wrongKey = crypto.randomBytes(32);

    assert.throws(
      () => {
        documentEncryptionService.decryptDocument(
          encrypted.ciphertextBuffer,
          encrypted.iv,
          encrypted.authTag,
          encrypted.checksum,
          { customKey: wrongKey }
        );
      },
      (err) => {
        return err.code === 'DECRYPTION_AUTH_FAILED' || err.message.includes('decryption failed');
      },
      'Decryption with wrong key must fail'
    );
  });

  it('should fail integrity verification if SHA-256 fingerprint does not match', () => {
    const encrypted = documentEncryptionService.encryptDocument(originalPlaintext);
    const forgedChecksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // hash of empty string

    assert.throws(
      () => {
        documentEncryptionService.decryptDocument(
          encrypted.ciphertextBuffer,
          encrypted.iv,
          encrypted.authTag,
          forgedChecksum
        );
      },
      (err) => {
        return err.code === 'CHECKSUM_INTEGRITY_MISMATCH' || err.message.includes('integrity verification failed');
      },
      'SHA-256 fingerprint mismatch must fail document ingestion'
    );
  });

  it('should encrypt on upload and decrypt via storageService.getDecryptedBuffer', async () => {
    const orgId = 'test-org-uuid-123';
    const uploadResult = await storageService.upload(
      originalPlaintext,
      'test_encrypted_passport.png',
      'image/png',
      orgId
    );

    assert.strictEqual(uploadResult.isEncrypted, true);
    assert.ok(uploadResult.iv);
    assert.ok(uploadResult.authTag);
    assert.strictEqual(uploadResult.encryptionAlgorithm, 'AES-256-GCM');
    assert.ok(uploadResult.storageKey);

    // Retrieve and decrypt
    const decryptedBuffer = await storageService.getDecryptedBuffer({
      storage_key: uploadResult.storageKey,
      iv: uploadResult.iv,
      auth_tag: uploadResult.authTag,
      checksum: uploadResult.checksum,
      is_encrypted: true,
    });

    assert.deepStrictEqual(decryptedBuffer, originalPlaintext);
  });

  it('should support streaming decrypted bytes via storageService.downloadStream', async () => {
    const orgId = 'test-org-uuid-456';
    const uploadResult = await storageService.upload(
      originalPlaintext,
      'test_stream_doc.pdf',
      'application/pdf',
      orgId
    );

    const { stream, size } = await storageService.downloadStream({
      storage_key: uploadResult.storageKey,
      iv: uploadResult.iv,
      auth_tag: uploadResult.authTag,
      checksum: uploadResult.checksum,
      is_encrypted: true,
    });

    assert.strictEqual(size, originalPlaintext.length);

    // Read all chunks from stream
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const streamedBuffer = Buffer.concat(chunks);

    assert.deepStrictEqual(streamedBuffer, originalPlaintext);
  });

  it('should gracefully handle legacy unencrypted documents for backward compatibility', async () => {
    const rawPlaintext = Buffer.from('Legacy unencrypted document buffer', 'utf-8');
    const checksum = crypto.createHash('sha256').update(rawPlaintext).digest('hex');

    // Manually register in cache as unencrypted
    storageService.memoryCache.set('legacy_key_123', rawPlaintext);

    const result = await storageService.getDecryptedBuffer({
      storage_key: 'legacy_key_123',
      iv: null,
      auth_tag: null,
      checksum,
      is_encrypted: false,
    });

    assert.deepStrictEqual(result, rawPlaintext);
  });
});
