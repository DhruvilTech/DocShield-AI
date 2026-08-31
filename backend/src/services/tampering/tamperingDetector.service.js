// src/services/tampering/tamperingDetector.service.js
import crypto from 'crypto';
import { tamperingRepository } from '../../repositories/tampering.repository.js';
import { extractionRepository } from '../../repositories/extraction.repository.js';
import { documentVersionRepository } from '../../repositories/documentVersion.repository.js';
import { documentRepository } from '../../repositories/document.repository.js';
import { storageService } from '../storage.service.js';
import { auditService } from '../audit.service.js';
import { pythonBridgeService } from './pythonBridge.service.js';
import { AUDIT_ACTIONS, TAMPERING_CATEGORIES } from '../../config/constants.js';
import { AppError } from '../../errors/AppError.js';
import logger from '../../utils/logger.js';

// Map detector sources to backend categories (compatible with database schema)
const CATEGORY_MAP = {
  text_tampering: TAMPERING_CATEGORIES.TEXT_ALTERATION,
  content_alteration: TAMPERING_CATEGORIES.TEXT_ALTERATION,
  splicing: TAMPERING_CATEGORIES.PHOTO_SUBSTITUTION,
  copy_move: TAMPERING_CATEGORIES.PHOTO_SUBSTITUTION,
  ela: TAMPERING_CATEGORIES.COMPRESSION_ANOMALY,
  noise: TAMPERING_CATEGORIES.COMPRESSION_ANOMALY,
  metadata: TAMPERING_CATEGORIES.METADATA_MISMATCH,
  stamp: TAMPERING_CATEGORIES.STAMP_IRREGULARITY,
  stamp_forgery: TAMPERING_CATEGORIES.STAMP_IRREGULARITY,
  STAMP_FORGERY: TAMPERING_CATEGORIES.STAMP_IRREGULARITY,
  COPY_MOVE_FORGERY: TAMPERING_CATEGORIES.PHOTO_SUBSTITUTION,
  IMAGE_SPLICING: TAMPERING_CATEGORIES.PHOTO_SUBSTITUTION,
  CONTENT_ALTERATION: TAMPERING_CATEGORIES.TEXT_ALTERATION,
  NOISE_INCONSISTENCY: TAMPERING_CATEGORIES.COMPRESSION_ANOMALY,
};

export class TamperingDetectorService {
  /**
   * Run comprehensive document tampering forensics via Python forensic engine.
   */
  async analyzeDocument(documentId, organizationId, options = {}, reqMeta = {}) {
    const doc = await documentRepository.findById(documentId, organizationId);
    if (!doc) {
      throw AppError.notFound('Document not found in organization', 'DOCUMENT_NOT_FOUND');
    }

    const targetVersionNumber = options.versionNumber || doc.current_version;
    const version = await documentVersionRepository.findByVersionNumber(documentId, targetVersionNumber);
    if (!version) {
      throw AppError.notFound(`Version ${targetVersionNumber} not found`, 'VERSION_NOT_FOUND');
    }

    // 1. Fetch text extraction (if available) for cross-verifying text consistency
    const extraction = await extractionRepository.findByDocument(documentId, organizationId, version.id);

    // 2. Fetch binary document buffer
    let fileBuffer = null;
    try {
      fileBuffer = await storageService.downloadFile(version.storage_key, version.checksum);
    } catch (err) {
      logger.warn(`Could not download file buffer for tampering analysis: ${err.message}`);
    }

    if (!fileBuffer) {
      throw AppError.badRequest('Could not retrieve file content for forensic analysis');
    }

    const startTime = Date.now();

    // 3. Execute Real Python Forensic Engine
    let forensicResult;
    try {
      forensicResult = await pythonBridgeService.analyzeFileBuffer(
        fileBuffer,
        version.original_filename || doc.name || 'document.png',
        {
          saveDebug: Boolean(options.saveDebug || options.debug),
          debugDir: options.debugDir,
        }
      );
    } catch (bridgeErr) {
      logger.error(`[TamperingService] Python forensic bridge failed: ${bridgeErr.message}`);
      throw bridgeErr;
    }

    const overallTamperingScore = forensicResult.score ?? (forensicResult.fusion?.score || 0.0);
    const hasTamperingDetected = forensicResult.tampered ?? (overallTamperingScore >= 0.50 || ['HIGH', 'CRITICAL'].includes(forensicResult.risk_level));

    // 4. Transform regions & signal evidence to database indicators
    const indicators = [];

    // 1. Localized spatial regions
    const regionsList = Array.isArray(forensicResult.regions) ? forensicResult.regions : [];
    for (const reg of regionsList) {
      indicators.push({
        category: CATEGORY_MAP[reg.source] || TAMPERING_CATEGORIES.EDGE_DISCONTINUITY,
        severity: reg.severity || (reg.score >= 0.7 ? 'HIGH' : reg.score >= 0.4 ? 'MEDIUM' : 'LOW'),
        confidence: reg.score || 0.85,
        description: reg.reason || `Suspicious forensic anomaly detected via ${reg.source}`,
        evidence: `Localized anomaly (Score: ${(reg.score * 100).toFixed(1)}%) in Page ${reg.page || 1}`,
        boundingBox: {
          x: reg.x,
          y: reg.y,
          width: reg.width,
          height: reg.height,
          page: reg.page || 1,
          target_x: reg.target_x,
          target_y: reg.target_y,
          target_width: reg.target_width,
          target_height: reg.target_height,
        },
      });
    }

    // 2. Correlated Fused Regions from Phase 10 Evidence Fusion
    const fusedList = forensicResult.fusion?.evidence?.fused_regions || forensicResult.fused_regions || [];
    for (const fused of fusedList) {
      if (!indicators.some((i) => i.description === fused.reason)) {
        const supporting = fused.supporting_detectors || [];
        const primSource = supporting[0] ? supporting[0].toLowerCase() : 'fusion';
        indicators.push({
          category: CATEGORY_MAP[primSource] || TAMPERING_CATEGORIES.COMPRESSION_ANOMALY,
          severity: fused.severity || 'MEDIUM',
          confidence: fused.detector_count ? Math.min(1.0, 0.4 + fused.detector_count * 0.2) : 0.8,
          description: fused.reason || `Spatial evidence correlation across ${supporting.join(', ')}`,
          evidence: `Fused Region ${fused.region_id || ''} (${fused.evidence_strength || 'MODERATE'} evidence)`,
          boundingBox: fused.bbox ? {
            x: fused.bbox[0] || 0,
            y: fused.bbox[1] || 0,
            width: fused.bbox[2] || 0,
            height: fused.bbox[3] || 0,
            page: fused.page || 1,
          } : null,
        });
      }
    }

    // 3. Detector signal evidence
    if (forensicResult.signals) {
      for (const [sigName, sigData] of Object.entries(forensicResult.signals)) {
        if (sigData?.evidence && sigData.evidence.length > 0) {
          for (const ev of sigData.evidence) {
            const evDesc = typeof ev === 'string'
              ? ev
              : (ev?.message || ev?.description || ev?.reason || `Forensic signal ${sigName} triggered`);
            const evSev = (typeof ev === 'object' && ev?.severity)
              ? ev.severity
              : (sigData.score >= 0.7 ? 'HIGH' : sigData.score >= 0.4 ? 'MEDIUM' : 'LOW');
            const evConfidence = typeof sigData.confidence === 'number'
              ? sigData.confidence
              : (typeof sigData.score === 'number' ? sigData.score : 0.75);

            indicators.push({
              category: CATEGORY_MAP[sigName] || TAMPERING_CATEGORIES.COMPRESSION_ANOMALY,
              severity: evSev,
              confidence: evConfidence,
              description: evDesc,
              evidence: `Signal ${sigName} triggered with score ${(((sigData.score || 0)) * 100).toFixed(1)}%`,
              boundingBox: null,
            });
          }
        } else if (sigData?.score >= 0.25) {
          indicators.push({
            category: CATEGORY_MAP[sigName] || TAMPERING_CATEGORIES.COMPRESSION_ANOMALY,
            severity: sigData.score >= 0.6 ? 'HIGH' : sigData.score >= 0.35 ? 'MEDIUM' : 'LOW',
            confidence: typeof sigData.confidence === 'number' ? sigData.confidence : (typeof sigData.score === 'number' ? sigData.score : 0.8),
            description: `Forensic anomaly detected in ${sigName} analysis`,
            evidence: `Detector score: ${((sigData.score || 0) * 100).toFixed(1)}%`,
            boundingBox: null,
          });
        }
      }
    }

    const analysisMetadata = {
      analyzedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      fileSize: version.file_size,
      mimeType: version.mime_type,
      totalIndicators: indicators.length,
      quality: forensicResult.quality,
      explanations: forensicResult.explanations || forensicResult.fusion?.evidence?.explanations || [],
      riskLevel: forensicResult.risk_level || forensicResult.fusion?.risk_level || 'LOW',
      detectorsAvailable: forensicResult.fusion?.evidence?.detectors_available || [],
      rawSignals: forensicResult.signals,
      pages: forensicResult.pages || null,
      debug: forensicResult.debug || null,
    };

    // 5. Persist analysis record
    const analysis = await tamperingRepository.createAnalysis({
      id: crypto.randomUUID(),
      documentId: doc.id,
      versionId: version.id,
      organizationId,
      status: 'COMPLETED',
      overallTamperingScore,
      hasTamperingDetected,
      analysisMetadata,
    });

    // 6. Persist individual indicators
    for (const ind of indicators) {
      await tamperingRepository.createIndicator({
        tamperingAnalysisId: analysis.id,
        category: ind.category,
        severity: ind.severity,
        confidence: ind.confidence,
        description: ind.description,
        evidence: ind.evidence,
        boundingBox: ind.boundingBox,
      });
    }

    // 7. Audit log
    await auditService.log({
      organizationId,
      userId: reqMeta.userId || null,
      action: AUDIT_ACTIONS.TAMPERING_ANALYSIS_COMPLETED,
      resourceType: 'tampering_analysis',
      resourceId: analysis.id,
      description: `Forensic tampering analysis completed for document "${doc.name}" v${version.version_number} (${forensicResult.risk_level || 'LOW'}, Score: ${overallTamperingScore})`,
      metadata: {
        documentId: doc.id,
        versionId: version.id,
        overallTamperingScore,
        hasTamperingDetected,
        riskLevel: forensicResult.risk_level,
        indicatorsCount: indicators.length,
      },
      ipAddress: reqMeta.ipAddress,
      userAgent: reqMeta.userAgent,
    });

    return tamperingRepository.findAnalysisById(analysis.id, organizationId);
  }

  /**
   * Run standalone direct tampering analysis on uploaded file buffer.
   */
  async analyzeDirect(fileBuffer, originalFilename, options = {}) {
    return pythonBridgeService.analyzeFileBuffer(fileBuffer, originalFilename, options);
  }

  /**
   * Get latest tampering analysis for a document
   */
  async getLatestTampering(documentId, organizationId, versionId = null) {
    const doc = await documentRepository.findById(documentId, organizationId);
    if (!doc) {
      throw AppError.notFound('Document not found in organization', 'DOCUMENT_NOT_FOUND');
    }

    return tamperingRepository.findLatestByDocument(documentId, organizationId, versionId);
  }
}

export const tamperingDetectorService = new TamperingDetectorService();
