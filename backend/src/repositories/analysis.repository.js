// src/repositories/analysis.repository.js
import { db } from '../database/db.js';

export class AnalysisRepository {
  async createAnalysis(analysis, connection = null) {
    const sql = `
      INSERT INTO document_analyses (
        id, document_id, version_id, organization_id, status,
        provider, model, prompt_version, document_type, confidence,
        summary, structured_result, processing_duration_ms, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [
      analysis.id,
      analysis.documentId,
      analysis.versionId,
      analysis.organizationId,
      analysis.status || 'COMPLETED',
      analysis.provider || 'heuristic',
      analysis.model || 'docshield-intelligence-v1',
      analysis.promptVersion || 'v1.0',
      analysis.documentType || 'OTHER',
      analysis.confidence !== undefined ? analysis.confidence : 0.95,
      analysis.summary || null,
      analysis.structuredResult ? JSON.stringify(analysis.structuredResult) : null,
      analysis.processingDurationMs || null,
      analysis.errorMessage || null,
    ];

    if (connection) {
      await connection.execute(sql, params);
    } else {
      await db.execute(sql, params);
    }

    return this.findAnalysisById(analysis.id, analysis.organizationId, connection);
  }

  async createFinding(finding, connection = null) {
    const sql = `
      INSERT INTO analysis_findings (
        id, analysis_id, document_id, version_id, organization_id,
        category, severity, title, description, evidence, confidence, location
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [
      finding.id,
      finding.analysisId,
      finding.documentId,
      finding.versionId,
      finding.organizationId,
      finding.category,
      finding.severity || 'INFO',
      finding.title,
      finding.description,
      finding.evidence || null,
      finding.confidence !== undefined ? finding.confidence : 1.0,
      finding.location || null,
    ];

    if (connection) {
      await connection.execute(sql, params);
    } else {
      await db.execute(sql, params);
    }
  }

  async createRiskIndicator(indicator, connection = null) {
    const sql = `
      INSERT INTO analysis_risk_indicators (
        id, analysis_id, document_id, version_id, organization_id,
        indicator, category, severity, confidence, evidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [
      indicator.id,
      indicator.analysisId,
      indicator.documentId,
      indicator.versionId,
      indicator.organizationId,
      indicator.indicator,
      indicator.category,
      indicator.severity || 'INFO',
      indicator.confidence !== undefined ? indicator.confidence : 1.0,
      indicator.evidence || null,
    ];

    if (connection) {
      await connection.execute(sql, params);
    } else {
      await db.execute(sql, params);
    }
  }

  async findAnalysisById(id, organizationId = null, connection = null) {
    let sql = 'SELECT * FROM document_analyses WHERE id = ?';
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

    return this.formatAnalysis(record);
  }

  async findLatestByDocument(documentId, organizationId, versionId = null, connection = null) {
    let sql = `
      SELECT * FROM document_analyses
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

    return this.formatAnalysis(record);
  }

  async listFindingsByAnalysis(analysisId, organizationId, connection = null) {
    const sql = `
      SELECT * FROM analysis_findings
      WHERE analysis_id = ? AND organization_id = ?
      ORDER BY 
        CASE severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          WHEN 'INFO' THEN 5
          ELSE 6
        END, created_at ASC;
    `;
    const params = [analysisId, organizationId];

    if (connection) {
      const [rows] = await connection.execute(sql, params);
      return rows;
    }
    return db.query(sql, params);
  }

  async listFindingsByDocument(documentId, organizationId, versionId = null, connection = null) {
    let sql = `
      SELECT * FROM analysis_findings
      WHERE document_id = ? AND organization_id = ?
    `;
    const params = [documentId, organizationId];

    if (versionId) {
      sql += ' AND version_id = ?';
      params.push(versionId);
    }

    sql += `
      ORDER BY 
        CASE severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          WHEN 'INFO' THEN 5
          ELSE 6
        END, created_at ASC;
    `;

    if (connection) {
      const [rows] = await connection.execute(sql, params);
      return rows;
    }
    return db.query(sql, params);
  }

  async listRiskIndicatorsByAnalysis(analysisId, organizationId, connection = null) {
    const sql = `
      SELECT * FROM analysis_risk_indicators
      WHERE analysis_id = ? AND organization_id = ?
      ORDER BY created_at ASC;
    `;
    const params = [analysisId, organizationId];

    if (connection) {
      const [rows] = await connection.execute(sql, params);
      return rows;
    }
    return db.query(sql, params);
  }

  async listRiskIndicatorsByDocument(documentId, organizationId, versionId = null, connection = null) {
    let sql = `
      SELECT * FROM analysis_risk_indicators
      WHERE document_id = ? AND organization_id = ?
    `;
    const params = [documentId, organizationId];

    if (versionId) {
      sql += ' AND version_id = ?';
      params.push(versionId);
    }

    sql += ' ORDER BY created_at ASC;';

    if (connection) {
      const [rows] = await connection.execute(sql, params);
      return rows;
    }
    return db.query(sql, params);
  }

  formatAnalysis(record) {
    if (!record) return null;
    return {
      ...record,
      structured_result: typeof record.structured_result === 'string'
        ? JSON.parse(record.structured_result)
        : record.structured_result,
    };
  }
}

export const analysisRepository = new AnalysisRepository();
