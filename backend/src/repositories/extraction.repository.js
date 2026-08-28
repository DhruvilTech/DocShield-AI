// src/repositories/extraction.repository.js
import { db } from '../database/db.js';

export class ExtractionRepository {
  async create(extraction, connection = null) {
    const sql = `
      INSERT INTO document_extractions (
        id, document_id, version_id, organization_id, status,
        extractor_name, document_type, raw_text, normalized_text,
        extracted_fields, confidence_score, page_count, metadata, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [
      extraction.id,
      extraction.documentId,
      extraction.versionId,
      extraction.organizationId,
      extraction.status || 'COMPLETED',
      extraction.extractorName || 'DocumentExtractor',
      extraction.documentType || 'OTHER',
      extraction.rawText || null,
      extraction.normalizedText || null,
      extraction.extractedFields ? JSON.stringify(extraction.extractedFields) : null,
      extraction.confidenceScore !== undefined ? extraction.confidenceScore : 0.95,
      extraction.pageCount || 1,
      extraction.metadata ? JSON.stringify(extraction.metadata) : null,
      extraction.errorMessage || null,
    ];

    if (connection) {
      await connection.execute(sql, params);
    } else {
      await db.execute(sql, params);
    }

    return this.findById(extraction.id, extraction.organizationId, connection);
  }

  async findById(id, organizationId = null, connection = null) {
    let sql = 'SELECT * FROM document_extractions WHERE id = ?';
    const params = [id];

    if (organizationId) {
      sql += ' AND organization_id = ?';
      params.push(organizationId);
    }

    let record;
    if (connection) {
      const [rows] = await connection.execute(sql, params);
      record = rows[0] || null;
    } else {
      record = await db.queryOne(sql, params);
    }

    return this.formatExtraction(record);
  }

  async findByDocument(documentId, organizationId, versionId = null, connection = null) {
    let sql = `
      SELECT * FROM document_extractions
      WHERE document_id = ? AND organization_id = ?
    `;
    const params = [documentId, organizationId];

    if (versionId) {
      sql += ' AND version_id = ?';
      params.push(versionId);
    }

    sql += ' ORDER BY created_at DESC LIMIT 1;';

    let record;
    if (connection) {
      const [rows] = await connection.execute(sql, params);
      record = rows[0] || null;
    } else {
      record = await db.queryOne(sql, params);
    }

    return this.formatExtraction(record);
  }

  formatExtraction(record) {
    if (!record) return null;
    return {
      ...record,
      extracted_fields: typeof record.extracted_fields === 'string'
        ? JSON.parse(record.extracted_fields)
        : record.extracted_fields,
      metadata: typeof record.metadata === 'string'
        ? JSON.parse(record.metadata)
        : record.metadata,
    };
  }
}

export const extractionRepository = new ExtractionRepository();
