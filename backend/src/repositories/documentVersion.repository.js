// src/repositories/documentVersion.repository.js
import { db } from '../database/db.js';

export class DocumentVersionRepository {
  async create(version, connection = null) {
    const sql = `
      INSERT INTO document_versions (
        id, document_id, version_number, storage_key, original_filename,
        mime_type, file_size, checksum, iv, auth_tag,
        encryption_algorithm, key_version, is_encrypted, cloudinary_public_id,
        uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [
      version.id,
      version.documentId,
      version.versionNumber,
      version.storageKey,
      version.originalFilename,
      version.mimeType,
      version.fileSize,
      version.checksum,
      version.iv ?? null,
      version.authTag ?? null,
      version.encryptionAlgorithm ?? 'AES-256-GCM',
      version.keyVersion ?? 'v1',
      version.isEncrypted !== undefined ? version.isEncrypted : true,
      version.cloudinaryPublicId ?? null,
      version.uploadedBy,
    ];

    if (connection) {
      await connection.execute(sql, params);
    } else {
      await db.execute(sql, params);
    }

    return this.findById(version.id, connection);
  }

  async findById(id, connection = null) {
    const sql = `
      SELECT dv.*, u.name AS uploader_name, u.email AS uploader_email
      FROM document_versions dv
      INNER JOIN users u ON dv.uploaded_by = u.id
      WHERE dv.id = ?;
    `;
    if (connection) {
      const [rows] = await connection.execute(sql, [id]);
      return rows[0] || null;
    }
    return db.queryOne(sql, [id]);
  }

  async findByVersionNumber(documentId, versionNumber, connection = null) {
    const sql = `
      SELECT dv.*, u.name AS uploader_name, u.email AS uploader_email
      FROM document_versions dv
      INNER JOIN users u ON dv.uploaded_by = u.id
      WHERE dv.document_id = ? AND dv.version_number = ?;
    `;
    if (connection) {
      const [rows] = await connection.execute(sql, [documentId, versionNumber]);
      return rows[0] || null;
    }
    return db.queryOne(sql, [documentId, versionNumber]);
  }

  async listByDocument(documentId) {
    const sql = `
      SELECT dv.*, u.name AS uploader_name, u.email AS uploader_email
      FROM document_versions dv
      INNER JOIN users u ON dv.uploaded_by = u.id
      WHERE dv.document_id = ?
      ORDER BY dv.version_number DESC;
    `;
    return db.query(sql, [documentId]);
  }

  async getNextVersionNumber(documentId, connection = null) {
    const sql = `
      SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
      FROM document_versions
      WHERE document_id = ?
      ${connection ? 'FOR UPDATE' : ''};
    `;
    if (connection) {
      const [rows] = await connection.execute(sql, [documentId]);
      return rows[0] ? rows[0].next_version : 1;
    }
    const res = await db.queryOne(sql, [documentId]);
    return res ? res.next_version : 1;
  }
}

export const documentVersionRepository = new DocumentVersionRepository();
