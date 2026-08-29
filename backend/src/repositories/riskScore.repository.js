// src/repositories/riskScore.repository.js
import { db } from '../database/db.js';
import crypto from 'crypto';

export class RiskScoreRepository {
  /**
   * Create or update a document risk score record
   */
  async create({
    id = crypto.randomUUID(),
    documentId,
    versionId,
    organizationId,
    riskScore = 0,
    riskLevel = 'LOW',
    confidence = 0.9,
    scoringModelVersion = 'risk-engine-v2',
    scoreBreakdown = {},
    explanation = '',
  }) {
    const query = `
      INSERT INTO document_risk_scores (
        id, document_id, version_id, organization_id,
        risk_score, risk_level, confidence, scoring_model_version,
        score_breakdown, explanation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.execute(query, [
      id,
      documentId,
      versionId,
      organizationId,
      riskScore,
      riskLevel,
      confidence,
      scoringModelVersion,
      JSON.stringify(scoreBreakdown),
      explanation,
    ]);

    return this.findById(id, organizationId);
  }

  /**
   * Find risk score by ID
   */
  async findById(id, organizationId) {
    const query = `
      SELECT * FROM document_risk_scores
      WHERE id = ? AND organization_id = ?
    `;

    const rows = await db.query(query, [id, organizationId]);
    if (rows.length === 0) return null;

    const record = rows[0];
    if (typeof record.score_breakdown === 'string') {
      try {
        record.score_breakdown = JSON.parse(record.score_breakdown);
      } catch (e) {}
    }

    return record;
  }

  /**
   * Find latest risk score for document & optional version
   */
  async findLatestByDocument(documentId, organizationId, versionId = null) {
    let query = `
      SELECT * FROM document_risk_scores
      WHERE document_id = ? AND organization_id = ?
    `;
    const params = [documentId, organizationId];

    if (versionId) {
      query += ` AND version_id = ?`;
      params.push(versionId);
    }

    query += ` ORDER BY created_at DESC LIMIT 1`;

    const rows = await db.query(query, params);
    if (rows.length === 0) return null;

    const record = rows[0];
    if (typeof record.score_breakdown === 'string') {
      try {
        record.score_breakdown = JSON.parse(record.score_breakdown);
      } catch (e) {}
    }

    return record;
  }
}

export const riskScoreRepository = new RiskScoreRepository();
