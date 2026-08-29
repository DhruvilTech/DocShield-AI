// src/repositories/faceVerification.repository.js
import { db } from '../database/db.js';
import crypto from 'crypto';

export class FaceVerificationRepository {
  /**
   * Create a face verification record
   */
  async create({
    id = crypto.randomUUID(),
    documentId,
    versionId,
    organizationId,
    status = 'INCONCLUSIVE',
    similarityScore = 0.0,
    confidence = 0.0,
    matchThreshold = 0.75,
    modelName = 'docshield-facenet-v1',
    faceDetectedInDoc = false,
    referenceFaceProvided = false,
    processingTimeMs = 0,
    metadata = null,
  }) {
    const query = `
      INSERT INTO face_verifications (
        id, document_id, version_id, organization_id, status,
        similarity_score, confidence, match_threshold, model_name,
        face_detected_in_doc, reference_face_provided, processing_time_ms, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.execute(query, [
      id,
      documentId,
      versionId,
      organizationId,
      status,
      similarityScore,
      confidence,
      matchThreshold,
      modelName,
      faceDetectedInDoc ? 1 : 0,
      referenceFaceProvided ? 1 : 0,
      processingTimeMs,
      metadata ? JSON.stringify(metadata) : null,
    ]);

    return this.findById(id, organizationId);
  }

  /**
   * Find face verification by ID
   */
  async findById(id, organizationId) {
    const query = `
      SELECT * FROM face_verifications
      WHERE id = ? AND organization_id = ?
    `;

    const rows = await db.query(query, [id, organizationId]);
    if (rows.length === 0) return null;

    const record = rows[0];
    record.face_detected_in_doc = Boolean(record.face_detected_in_doc);
    record.reference_face_provided = Boolean(record.reference_face_provided);
    if (typeof record.metadata === 'string') {
      try {
        record.metadata = JSON.parse(record.metadata);
      } catch (e) {}
    }

    return record;
  }

  /**
   * Find latest face verification record for a document & optional version
   */
  async findLatestByDocument(documentId, organizationId, versionId = null) {
    let query = `
      SELECT * FROM face_verifications
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
    record.face_detected_in_doc = Boolean(record.face_detected_in_doc);
    record.reference_face_provided = Boolean(record.reference_face_provided);
    if (typeof record.metadata === 'string') {
      try {
        record.metadata = JSON.parse(record.metadata);
      } catch (e) {}
    }

    return record;
  }
}

export const faceVerificationRepository = new FaceVerificationRepository();
