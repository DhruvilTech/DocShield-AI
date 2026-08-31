// src/repositories/document.repository.js
import { db } from '../database/db.js';

export class DocumentRepository {
  async create(doc, connection = null) {
    const sql = `
      INSERT INTO documents (
        id, organization_id, uploaded_by, name, original_filename,
        mime_type, file_size, storage_key, document_type, status, processing_status, description, current_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [
      doc.id,
      doc.organizationId,
      doc.uploadedBy,
      doc.name,
      doc.originalFilename,
      doc.mimeType,
      doc.fileSize,
      doc.storageKey,
      doc.documentType || 'OTHER',
      doc.status || 'ACTIVE',
      doc.processingStatus || 'UPLOADED',
      doc.description || null,
      doc.currentVersion || 1,
    ];

    if (connection) {
      await connection.execute(sql, params);
    } else {
      await db.execute(sql, params);
    }

    return this.findById(doc.id, doc.organizationId, connection);
  }

  async findById(id, organizationId = null, connection = null) {
    let sql = `
      SELECT d.*, u.name AS uploader_name, u.email AS uploader_email,
             dv.checksum AS current_checksum, o.name AS organization_name, o.slug AS organization_slug,
             COALESCE(ta.has_tampering_detected, FALSE) AS has_tampering,
             COALESCE(ta.overall_tampering_score, 0.0000) AS tampering_score,
             ta.status AS tampering_status,
             COALESCE(rs.risk_score, ds.overall_risk_score, 0) AS risk_score,
             COALESCE(rs.risk_level, ds.overall_risk_level, 'LOW') AS risk_level,
             COALESCE(ds.verdict, 'PASSED') AS screening_verdict,
             ds.summary AS screening_summary,
             fv.status AS face_status,
             fv.confidence AS face_confidence,
             fv.similarity_score AS face_similarity_score
      FROM documents d
      INNER JOIN users u ON d.uploaded_by = u.id
      INNER JOIN organizations o ON d.organization_id = o.id
      LEFT JOIN document_versions dv ON d.id = dv.document_id AND d.current_version = dv.version_number
      LEFT JOIN (
        SELECT ta1.* FROM tampering_analyses ta1
        INNER JOIN (
          SELECT document_id, MAX(created_at) as max_created FROM tampering_analyses GROUP BY document_id
        ) ta_max ON ta1.document_id = ta_max.document_id AND ta1.created_at = ta_max.max_created
      ) ta ON d.id = ta.document_id
      LEFT JOIN (
        SELECT rs1.* FROM document_risk_scores rs1
        INNER JOIN (
          SELECT document_id, MAX(created_at) as max_created FROM document_risk_scores GROUP BY document_id
        ) rs_max ON rs1.document_id = rs_max.document_id AND rs1.created_at = rs_max.max_created
      ) rs ON d.id = rs.document_id
      LEFT JOIN (
        SELECT ds1.* FROM document_screenings ds1
        INNER JOIN (
          SELECT document_id, MAX(created_at) as max_created FROM document_screenings GROUP BY document_id
        ) ds_max ON ds1.document_id = ds_max.document_id AND ds1.created_at = ds_max.max_created
      ) ds ON d.id = ds.document_id
      LEFT JOIN (
        SELECT fv1.* FROM face_verifications fv1
        INNER JOIN (
          SELECT document_id, MAX(created_at) as max_created FROM face_verifications GROUP BY document_id
        ) fv_max ON fv1.document_id = fv_max.document_id AND fv1.created_at = fv_max.max_created
      ) fv ON d.id = fv.document_id
      WHERE d.id = ? AND d.status != 'DELETED'
    `;
    const params = [id];

    if (organizationId) {
      sql += ' AND d.organization_id = ?';
      params.push(organizationId);
    }

    if (connection) {
      const [rows] = await connection.execute(sql, params);
      return rows[0] || null;
    }
    return db.queryOne(sql, params);
  }

  async listByOrganization(organizationId, params = {}) {
    let sql = `
      SELECT d.*, u.name AS uploader_name, u.email AS uploader_email,
             dv.checksum AS current_checksum,
             COALESCE(ta.has_tampering_detected, FALSE) AS has_tampering,
             COALESCE(ta.overall_tampering_score, 0.0000) AS tampering_score,
             ta.status AS tampering_status,
             COALESCE(rs.risk_score, ds.overall_risk_score, 0) AS risk_score,
             COALESCE(rs.risk_level, ds.overall_risk_level, 'LOW') AS risk_level,
             COALESCE(ds.verdict, 'PASSED') AS screening_verdict,
             ds.summary AS screening_summary,
             fv.status AS face_status,
             fv.confidence AS face_confidence,
             fv.similarity_score AS face_similarity_score
      FROM documents d
      INNER JOIN users u ON d.uploaded_by = u.id
      LEFT JOIN document_versions dv ON d.id = dv.document_id AND d.current_version = dv.version_number
      LEFT JOIN (
        SELECT ta1.* FROM tampering_analyses ta1
        INNER JOIN (
          SELECT document_id, MAX(created_at) as max_created FROM tampering_analyses GROUP BY document_id
        ) ta_max ON ta1.document_id = ta_max.document_id AND ta1.created_at = ta_max.max_created
      ) ta ON d.id = ta.document_id
      LEFT JOIN (
        SELECT rs1.* FROM document_risk_scores rs1
        INNER JOIN (
          SELECT document_id, MAX(created_at) as max_created FROM document_risk_scores GROUP BY document_id
        ) rs_max ON rs1.document_id = rs_max.document_id AND rs1.created_at = rs_max.max_created
      ) rs ON d.id = rs.document_id
      LEFT JOIN (
        SELECT ds1.* FROM document_screenings ds1
        INNER JOIN (
          SELECT document_id, MAX(created_at) as max_created FROM document_screenings GROUP BY document_id
        ) ds_max ON ds1.document_id = ds_max.document_id AND ds1.created_at = ds_max.max_created
      ) ds ON d.id = ds.document_id
      LEFT JOIN (
        SELECT fv1.* FROM face_verifications fv1
        INNER JOIN (
          SELECT document_id, MAX(created_at) as max_created FROM face_verifications GROUP BY document_id
        ) fv_max ON fv1.document_id = fv_max.document_id AND fv1.created_at = fv_max.max_created
      ) fv ON d.id = fv.document_id
      WHERE d.organization_id = ? AND d.status != 'DELETED'
    `;
    const queryParams = [organizationId];

    if (params.search) {
      sql += ' AND (d.name LIKE ? OR d.original_filename LIKE ? OR d.description LIKE ?)';
      queryParams.push(`%${params.search}%`, `%${params.search}%`, `%${params.search}%`);
    }

    if (params.documentType) {
      sql += ' AND d.document_type = ?';
      queryParams.push(params.documentType);
    }

    if (params.status) {
      sql += ' AND d.status = ?';
      queryParams.push(params.status);
    }

    if (params.processingStatus) {
      sql += ' AND d.processing_status = ?';
      queryParams.push(params.processingStatus);
    }

    sql += ' ORDER BY d.created_at DESC';

    const page = parseInt(params.page, 10) || 1;
    const limit = parseInt(params.limit, 10) || 20;
    const offset = (page - 1) * limit;

    // Count
    const countSql = `SELECT COUNT(*) AS total FROM (${sql}) AS sub;`;
    const countRes = await db.queryOne(countSql, queryParams);
    const total = countRes ? countRes.total : 0;

    sql += ` LIMIT ? OFFSET ?;`;
    queryParams.push(limit, offset);

    const rows = await db.query(sql, queryParams);

    return {
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async updateMetadata(id, organizationId, data, connection = null) {
    const fields = [];
    const params = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      params.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push('description = ?');
      params.push(data.description);
    }
    if (data.documentType !== undefined) {
      fields.push('document_type = ?');
      params.push(data.documentType);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      params.push(data.status);
    }
    if (data.processingStatus !== undefined || data.processing_status !== undefined) {
      fields.push('processing_status = ?');
      params.push(data.processingStatus !== undefined ? data.processingStatus : data.processing_status);
    }
    if (data.currentVersion !== undefined) {
      fields.push('current_version = ?');
      params.push(data.currentVersion);
    }
    if (data.storageKey !== undefined) {
      fields.push('storage_key = ?');
      params.push(data.storageKey);
    }
    if (data.fileSize !== undefined) {
      fields.push('file_size = ?');
      params.push(data.fileSize);
    }
    if (data.mimeType !== undefined) {
      fields.push('mime_type = ?');
      params.push(data.mimeType);
    }
    if (data.originalFilename !== undefined) {
      fields.push('original_filename = ?');
      params.push(data.originalFilename);
    }

    if (fields.length === 0) return this.findById(id, organizationId, connection);

    params.push(id, organizationId);
    const sql = `UPDATE documents SET ${fields.join(', ')} WHERE id = ? AND organization_id = ?;`;

    if (connection) {
      await connection.execute(sql, params);
    } else {
      await db.execute(sql, params);
    }

    return this.findById(id, organizationId, connection);
  }

  async softDelete(id, organizationId, connection = null) {
    const sql = `
      UPDATE documents SET status = 'DELETED', deleted_at = NOW()
      WHERE id = ? AND organization_id = ?;
    `;
    if (connection) {
      await connection.execute(sql, [id, organizationId]);
    } else {
      await db.execute(sql, [id, organizationId]);
    }
  }
}

export const documentRepository = new DocumentRepository();
