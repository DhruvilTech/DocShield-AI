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

// Map detector sources to backend categories
const CATEGORY_MAP = {
  text_tampering: TAMPERING_CATEGORIES.TEXT_ALTERATION,
  content_alteration: TAMPERING_CATEGORIES.TEXT_ALTERATION,
  splicing: TAMPERING_CATEGORIES.PHOTO_SUBSTITUTION,
  copy_move: TAMPERING_CATEGORIES.PHOTO_SUBSTITUTION,
  ela: TAMPERING_CATEGORIES.COMPRESSION_ANOMALY,
  noise: TAMPERING_CATEGORIES.COMPRESSION_ANOMALY,
  metadata: TAMPERING_CATEGORIES.METADATA_MISMATCH,
  stamp: TAMPERING_CATEGORIES.STAMP_FORGERY,
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

    // Localized spatial regions
    if (Array.isArray(forensicResult.regions)) {
      for (const reg of forensicResult.regions) {
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
    }

    // High-severity detector signal evidence
    if (forensicResult.signals) {
      for (const [sigName, sigData] of Object.entries(forensicResult.signals)) {
        if (sigData?.evidence && sigData.score >= 0.5) {
          for (const ev of sigData.evidence) {
            if (ev.severity === 'HIGH' || ev.severity === 'CRITICAL') {
              indicators.push({
                category: CATEGORY_MAP[sigName] || TAMPERING_CATEGORIES.COMPRESSION_ANOMALY,
                severity: ev.severity,
                confidence: sigData.confidence || sigData.score,
                description: ev.message,
                evidence: `Signal ${sigName} triggered with score ${(sigData.score * 100).toFixed(1)}%`,
                boundingBox: null,
              });
            }
          }
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
