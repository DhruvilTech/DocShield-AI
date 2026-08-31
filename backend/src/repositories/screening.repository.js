// src/repositories/screening.repository.js
import { db } from '../database/db.js';
import crypto from 'crypto';

export class ScreeningRepository {
  /**
   * Create a document screening record
   */
  async createScreening({
    id = crypto.randomUUID(),
    documentId,
    versionId,
    organizationId,
    status = 'COMPLETED',
    overallRiskScore = 0,
    overallRiskLevel = 'LOW',
    verdict = 'PASSED',
    summary = '',
    recommendations = [],
    metadata = null,
  }) {
    const query = `
      INSERT INTO document_screenings (
        id, document_id, version_id, organization_id, status,
        overall_risk_score, overall_risk_level, verdict, summary,
        recommendations, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.execute(query, [
      id,
      documentId,
      versionId,
      organizationId,
      status,
      overallRiskScore,
      overallRiskLevel,
      verdict,
      summary,
      JSON.stringify(recommendations),
      metadata ? JSON.stringify(metadata) : null,
    ]);

    return this.findScreeningById(id, organizationId);
  }

  /**
   * Create a screening factor linked to a screening record
   */
  async createFactor({
    id = crypto.randomUUID(),
    screeningId,
    category,
    severity = 'INFO',
    title,
    description,
    impactScore = 0,
    evidence = null,
  }) {
    const query = `
      INSERT INTO screening_factors (
        id, screening_id, category, severity, title, description, impact_score, evidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.execute(query, [
      id,
      screeningId,
      category,
      severity,
      title,
      description,
      impactScore,
      evidence,
    ]);

    return {
      id,
      screening_id: screeningId,
      category,
      severity,
      title,
      description,
      impact_score: impactScore,
      evidence,
    };
  }

  /**
   * Find screening record by ID within tenant organization
   */
  async findScreeningById(id, organizationId) {
    const query = `
      SELECT * FROM document_screenings
      WHERE id = ? AND organization_id = ?
    `;

    const rows = await db.query(query, [id, organizationId]);
    if (rows.length === 0) return null;

    const screening = rows[0];
    if (typeof screening.recommendations === 'string') {
      try {
        screening.recommendations = JSON.parse(screening.recommendations);
      } catch (e) {
        screening.recommendations = [];
      }
    }
    if (typeof screening.metadata === 'string') {
      try {
        screening.metadata = JSON.parse(screening.metadata);
      } catch (e) {}
    }

    screening.factors = await this.findFactorsByScreeningId(screening.id);
    return screening;
  }

  /**
   * Find latest screening record by document and optional version
   */
  async findLatestByDocument(documentId, organizationId, versionId = null) {
    let query = `
      SELECT * FROM document_screenings
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

    const screening = rows[0];
    if (typeof screening.recommendations === 'string') {
      try {
        screening.recommendations = JSON.parse(screening.recommendations);
      } catch (e) {
        screening.recommendations = [];
      }
    }
    if (typeof screening.metadata === 'string') {
      try {
        screening.metadata = JSON.parse(screening.metadata);
      } catch (e) {}
    }

    screening.factors = await this.findFactorsByScreeningId(screening.id);
    return screening;
  }

  /**
   * Find all factors linked to a screening
   */
  async findFactorsByScreeningId(screeningId) {
    const query = `
      SELECT * FROM screening_factors
      WHERE screening_id = ?
      ORDER BY 
        CASE severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          WHEN 'INFO' THEN 5
          ELSE 6
        END,
        impact_score DESC
    `;

    const rows = await db.query(query, [screeningId]);
    return rows.map(row => {
      const match = row.title.match(/^Validation:\s+\[([A-Z0-9_]+)\]\s+(.*)$/);
      if (match) {
        return {
          ...row,
          rule: match[1],
          title: `Validation: ${match[2]}`
        };
      }
      return row;
    });
  }
}

export const screeningRepository = new ScreeningRepository();
