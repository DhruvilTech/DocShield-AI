// src/repositories/processingJob.repository.js
import { db } from '../database/db.js';

export class ProcessingJobRepository {
  async create(job, connection = null) {
    const sql = `
      INSERT INTO document_processing_jobs (
        id, document_id, version_id, organization_id, job_type,
        status, attempts, max_attempts, error_message, error_details, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [
      job.id,
      job.documentId,
      job.versionId,
      job.organizationId,
      job.jobType || 'FULL_PIPELINE',
      job.status || 'PENDING',
      job.attempts || 0,
      job.maxAttempts || 3,
      job.errorMessage || null,
      job.errorDetails ? JSON.stringify(job.errorDetails) : null,
      job.startedAt || null,
    ];

    if (connection) {
      await connection.execute(sql, params);
    } else {
      await db.execute(sql, params);
    }

    return this.findById(job.id, job.organizationId, connection);
  }

  async findById(id, organizationId = null, connection = null) {
    let sql = 'SELECT * FROM document_processing_jobs WHERE id = ?';
    const params = [id];

    if (organizationId) {
      sql += ' AND organization_id = ?';
      params.push(organizationId);
    }

    if (connection) {
      const [rows] = await connection.execute(sql, params);
      return rows[0] || null;
    }
    return db.queryOne(sql, params);
  }

  async findLatestByDocument(documentId, organizationId, connection = null) {
    let sql = `
      SELECT * FROM document_processing_jobs
      WHERE document_id = ? AND organization_id = ?
      ORDER BY created_at DESC
      LIMIT 1;
    `;
    const params = [documentId, organizationId];

    if (connection) {
      const [rows] = await connection.execute(sql, params);
      return rows[0] || null;
    }
    return db.queryOne(sql, params);
  }

  async listByDocument(documentId, organizationId, connection = null) {
    let sql = `
      SELECT * FROM document_processing_jobs
      WHERE document_id = ? AND organization_id = ?
      ORDER BY created_at DESC;
    `;
    const params = [documentId, organizationId];

    if (connection) {
      const [rows] = await connection.execute(sql, params);
      return rows;
    }
    return db.query(sql, params);
  }

  async updateStatus(id, organizationId, status, details = {}, connection = null) {
    const fields = ['status = ?'];
    const params = [status];

    if (details.attempts !== undefined) {
      fields.push('attempts = ?');
      params.push(details.attempts);
    }
    if (details.errorMessage !== undefined) {
      fields.push('error_message = ?');
      params.push(details.errorMessage);
    }
    if (details.errorDetails !== undefined) {
      fields.push('error_details = ?');
      params.push(JSON.stringify(details.errorDetails));
    }
    if (details.startedAt !== undefined) {
      fields.push('started_at = ?');
      params.push(details.startedAt);
    }
    if (details.completedAt !== undefined) {
      fields.push('completed_at = ?');
      params.push(details.completedAt);
    }
    if (details.failedAt !== undefined) {
      fields.push('failed_at = ?');
      params.push(details.failedAt);
    }

    params.push(id, organizationId);
    const sql = `UPDATE document_processing_jobs SET ${fields.join(', ')} WHERE id = ? AND organization_id = ?;`;

    if (connection) {
      await connection.execute(sql, params);
    } else {
      await db.execute(sql, params);
    }

    return this.findById(id, organizationId, connection);
  }
}

export const processingJobRepository = new ProcessingJobRepository();
