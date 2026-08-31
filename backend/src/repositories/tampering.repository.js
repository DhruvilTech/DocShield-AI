// src/repositories/tampering.repository.js
import { db } from '../database/db.js';
import crypto from 'crypto';

export class TamperingRepository {
  /**
   * Create a tampering analysis record
   */
  async createAnalysis({
    id = crypto.randomUUID(),
    documentId,
    versionId,
    organizationId,
    status = 'COMPLETED',
    overallTamperingScore = 0.0,
    hasTamperingDetected = false,
    analysisMetadata = null,
  }) {
    const query = `
      INSERT INTO tampering_analyses (
        id, document_id, version_id, organization_id, status,
        overall_tampering_score, has_tampering_detected, analysis_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const safeId = id || crypto.randomUUID();
    const safeDocId = documentId ?? null;
    const safeVerId = versionId ?? null;
    const safeOrgId = organizationId ?? null;
    const safeStatus = status || 'COMPLETED';
    const safeScore = typeof overallTamperingScore === 'number' ? overallTamperingScore : 0.0;
    const safeDetected = hasTamperingDetected ? 1 : 0;
    const safeMeta = analysisMetadata ? JSON.stringify(analysisMetadata) : null;

    await db.execute(query, [
      safeId,
      safeDocId,
      safeVerId,
      safeOrgId,
      safeStatus,
      safeScore,
      safeDetected,
      safeMeta,
    ]);

    return this.findAnalysisById(safeId, safeOrgId);
  }

  /**
   * Create an individual tampering indicator linked to an analysis
   */
  async createIndicator({
    id = crypto.randomUUID(),
    tamperingAnalysisId,
    category,
    severity = 'MEDIUM',
    confidence = 0.8,
    description = null,
    evidence = null,
    boundingBox = null,
  }) {
    // Normalize category to schema ENUM values to prevent truncation
    const NORMALIZED_CATEGORIES = {
      STAMP_FORGERY: 'STAMP_IRREGULARITY',
      COPY_MOVE_FORGERY: 'PHOTO_SUBSTITUTION',
      IMAGE_SPLICING: 'PHOTO_SUBSTITUTION',
      CONTENT_ALTERATION: 'TEXT_ALTERATION',
      NOISE_INCONSISTENCY: 'COMPRESSION_ANOMALY',
    };
    const safeId = id || crypto.randomUUID();
    const safeAnalysisId = tamperingAnalysisId ?? null;
    const safeCategory = NORMALIZED_CATEGORIES[category] || category || 'EDGE_DISCONTINUITY';
    const safeSeverity = severity || 'MEDIUM';
    const safeConfidence = typeof confidence === 'number' ? confidence : 0.8;
    const safeDescription = description || (evidence ? String(evidence) : 'Suspicious forensic anomaly detected');
    const safeEvidence = evidence !== undefined && evidence !== null ? String(evidence) : null;
    const safeBoundingBox = boundingBox ? JSON.stringify(boundingBox) : null;

    const query = `
      INSERT INTO tampering_indicators (
        id, tampering_analysis_id, category, severity,
        confidence, description, evidence, bounding_box
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.execute(query, [
      safeId,
      safeAnalysisId,
      safeCategory,
      safeSeverity,
      safeConfidence,
      safeDescription,
      safeEvidence,
      safeBoundingBox,
    ]);

    return {
      id: safeId,
      tampering_analysis_id: safeAnalysisId,
      category: safeCategory,
      severity: safeSeverity,
      confidence: safeConfidence,
      description: safeDescription,
      evidence: safeEvidence,
      bounding_box: boundingBox,
    };
  }

  /**
   * Find tampering analysis by ID within tenant organization
   */
  async findAnalysisById(id, organizationId) {
    const query = `
      SELECT * FROM tampering_analyses
      WHERE id = ? AND organization_id = ?
    `;

    const rows = await db.query(query, [id, organizationId]);
    if (rows.length === 0) return null;

    const analysis = rows[0];
    analysis.has_tampering_detected = Boolean(analysis.has_tampering_detected);
    if (typeof analysis.analysis_metadata === 'string') {
      try {
        analysis.analysis_metadata = JSON.parse(analysis.analysis_metadata);
      } catch (e) {}
    }

    analysis.indicators = await this.findIndicatorsByAnalysisId(analysis.id);
    return analysis;
  }

  /**
   * Find latest tampering analysis by document & optional version
   */
  async findLatestByDocument(documentId, organizationId, versionId = null) {
    let query = `
      SELECT * FROM tampering_analyses
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

    const analysis = rows[0];
    analysis.has_tampering_detected = Boolean(analysis.has_tampering_detected);
    if (typeof analysis.analysis_metadata === 'string') {
      try {
        analysis.analysis_metadata = JSON.parse(analysis.analysis_metadata);
      } catch (e) {}
    }

    analysis.indicators = await this.findIndicatorsByAnalysisId(analysis.id);
    return analysis;
  }

  /**
   * Find indicators for an analysis
   */
  async findIndicatorsByAnalysisId(tamperingAnalysisId) {
    const query = `
      SELECT * FROM tampering_indicators
      WHERE tampering_analysis_id = ?
      ORDER BY 
        CASE severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          WHEN 'INFO' THEN 5
          ELSE 6
        END,
        confidence DESC
    `;

    const rows = await db.query(query, [tamperingAnalysisId]);
    return rows.map((r) => {
      if (typeof r.bounding_box === 'string') {
        try {
          r.bounding_box = JSON.parse(r.bounding_box);
        } catch (e) {}
      }
      return r;
    });
  }
}

export const tamperingRepository = new TamperingRepository();
