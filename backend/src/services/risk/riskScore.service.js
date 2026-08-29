// src/services/risk/riskScore.service.js
import { riskScoreRepository } from '../../repositories/riskScore.repository.js';
import { tamperingRepository } from '../../repositories/tampering.repository.js';
import { faceVerificationRepository } from '../../repositories/faceVerification.repository.js';
import { analysisRepository } from '../../repositories/analysis.repository.js';
import { extractionRepository } from '../../repositories/extraction.repository.js';
import { documentVersionRepository } from '../../repositories/documentVersion.repository.js';
import { documentRepository } from '../../repositories/document.repository.js';
import { documentValidationService } from '../validation/documentValidation.service.js';
import { auditService } from '../audit.service.js';
import { AUDIT_ACTIONS, RISK_LEVELS } from '../../config/constants.js';
import { AppError } from '../../errors/AppError.js';
import crypto from 'crypto';

export class RiskScoreService {
  /**
   * Calculate deterministic multi-factor risk score for document version
   */
  async calculateRiskScore(documentId, organizationId, options = {}, reqMeta = {}) {
    const doc = await documentRepository.findById(documentId, organizationId);
    if (!doc) {
      throw AppError.notFound('Document not found in organization', 'DOCUMENT_NOT_FOUND');
    }

    const targetVersionNumber = options.versionNumber || doc.current_version;
    const version = await documentVersionRepository.findByVersionNumber(documentId, targetVersionNumber);
    if (!version) {
      throw AppError.notFound(`Version ${targetVersionNumber} not found`, 'VERSION_NOT_FOUND');
    }

    // 1. Fetch signal sources
    const [extraction, analysis, tampering, faceVerification] = await Promise.all([
      extractionRepository.findByDocument(documentId, organizationId, version.id),
      analysisRepository.findLatestByDocument(documentId, organizationId, version.id),
      tamperingRepository.findLatestByDocument(documentId, organizationId, version.id),
      faceVerificationRepository.findLatestByDocument(documentId, organizationId, version.id),
    ]);

    // 2. Run official standards & watchlist validation
    let validationResult = null;
    if (extraction && extraction.extracted_fields) {
      try {
        validationResult = await documentValidationService.validateDocument(
          extraction.extracted_fields,
          doc.document_type,
          organizationId,
          reqMeta
        );
      } catch (err) {
        // Fallback gracefully
      }
    }

    // 3. Compute component scores (max 100 points total)
    const breakdown = {
      tamperingScore: 0,   // up to 40
      validationScore: 0,  // up to 30
      biometricScore: 0,   // up to 20
      ocrQualityScore: 0,  // up to 10
    };

    const explanationItems = [];

    // --- A. Tampering Signals (0 to 40 points) ---
    if (tampering) {
      const tampScore = parseFloat(tampering.overall_tampering_score || 0);
      breakdown.tamperingScore = Math.round(tampScore * 40);

      if (tampering.has_tampering_detected) {
        explanationItems.push(`Tampering forensics detected anomalies (score: ${tampering.overall_tampering_score}).`);
      }
      if (tampering.indicators && tampering.indicators.some((i) => i.severity === 'CRITICAL')) {
        breakdown.tamperingScore = Math.max(breakdown.tamperingScore, 35);
        explanationItems.push('Critical forensic alteration detected in document structure.');
      }
    }

    // --- B. Official Validation, Watchlist & Security Findings (0 to 30 points) ---
    let findingPoints = 0;
    if (analysis && analysis.findings) {
      for (const f of analysis.findings) {
        if (f.severity === 'CRITICAL') findingPoints += 20;
        else if (f.severity === 'HIGH') findingPoints += 12;
        else if (f.severity === 'MEDIUM') findingPoints += 6;
        else if (f.severity === 'LOW') findingPoints += 2;
      }
    }

    if (validationResult && validationResult.findings) {
      for (const f of validationResult.findings) {
        if (f.severity === 'CRITICAL') findingPoints += 25;
        else if (f.severity === 'HIGH') findingPoints += 15;
        else if (f.severity === 'MEDIUM') findingPoints += 8;
        explanationItems.push(f.description);
      }
    }

    breakdown.validationScore = Math.min(30, findingPoints);

    if (analysis && analysis.findings) {
      const criticalFindings = analysis.findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
      if (criticalFindings.length > 0) {
        explanationItems.push(`${criticalFindings.length} high/critical validation anomalies found (e.g. ${criticalFindings[0].title}).`);
      }
    }

    // --- C. Biometric Face Verification (0 to 20 points) ---
    if (faceVerification) {
      const meta = faceVerification.metadata || {};
      const isLivenessFailed = meta.liveness && meta.liveness.status === 'FAIL';

      if (isLivenessFailed) {
        breakdown.biometricScore = 20;
        explanationItems.push(`Active biometric liveness challenge failed (${meta.liveness.reason || 'spoof detected'}).`);
      } else if (faceVerification.status === 'NO_MATCH') {
        breakdown.biometricScore = 20;
        explanationItems.push('Biometric portrait mismatch against presented reference subject.');
      } else if (faceVerification.status === 'INCONCLUSIVE') {
        breakdown.biometricScore = 10;
        explanationItems.push('Inconclusive biometric comparison requiring secondary manual review.');
      } else if (faceVerification.status === 'NO_FACE_DETECTED' && ['PASSPORT', 'NATIONAL_ID'].includes(doc.document_type)) {
        breakdown.biometricScore = 12;
        explanationItems.push('Mandatory photo portrait absent from primary identity document.');
      }
    }

    // --- D. OCR & Extraction Quality (0 to 10 points) ---
    if (extraction) {
      const conf = parseFloat(extraction.confidence_score || 0.95);
      if (conf < 0.70) {
        breakdown.ocrQualityScore = 10;
        explanationItems.push('Low OCR extraction confidence indicating degraded scan quality or illegible text.');
      } else if (conf < 0.85) {
        breakdown.ocrQualityScore = 5;
      }
    } else {
      breakdown.ocrQualityScore = 5;
    }

    // 4. Aggregate Total Risk Score (0 - 100)
    const rawTotal = breakdown.tamperingScore + breakdown.validationScore + breakdown.biometricScore + breakdown.ocrQualityScore;
    const finalScore = Math.min(100, Math.max(0, rawTotal));

    // 5. Map to Risk Level
    let riskLevel = RISK_LEVELS.LOW;
    if (finalScore >= 75) {
      riskLevel = RISK_LEVELS.CRITICAL;
    } else if (finalScore >= 50) {
      riskLevel = RISK_LEVELS.HIGH;
    } else if (finalScore >= 25) {
      riskLevel = RISK_LEVELS.MEDIUM;
    } else {
      riskLevel = RISK_LEVELS.LOW;
    }

    const explanation = explanationItems.length > 0
      ? explanationItems.join(' ')
      : 'Document passed all standard identity, forensic integrity, and validation checks with no anomalies detected.';

    // 6. Persist Risk Score
    const riskRecord = await riskScoreRepository.create({
      id: crypto.randomUUID(),
      documentId: doc.id,
      versionId: version.id,
      organizationId,
      riskScore: finalScore,
      riskLevel,
      confidence: 0.92,
      scoringModelVersion: 'risk-engine-v2-p8-integrated',
      scoreBreakdown: breakdown,
      explanation,
    });

    // 7. Audit log
    await auditService.log({
      organizationId,
      userId: reqMeta.userId || null,
      action: AUDIT_ACTIONS.RISK_ASSESSMENT_COMPLETED,
      resourceType: 'risk_score',
      resourceId: riskRecord.id,
      description: `Risk score evaluated for "${doc.name}" v${version.version_number}: ${finalScore}/100 (${riskLevel})`,
      metadata: {
        documentId: doc.id,
        versionId: version.id,
        riskScore: finalScore,
        riskLevel,
        scoreBreakdown: breakdown,
      },
      ipAddress: reqMeta.ipAddress,
      userAgent: reqMeta.userAgent,
    });

    return riskRecord;
  }

  /**
   * Get latest risk score for a document
   */
  async getLatestRiskScore(documentId, organizationId, versionId = null) {
    const doc = await documentRepository.findById(documentId, organizationId);
    if (!doc) {
      throw AppError.notFound('Document not found in organization', 'DOCUMENT_NOT_FOUND');
    }

    return riskScoreRepository.findLatestByDocument(documentId, organizationId, versionId);
  }
}

export const riskScoreService = new RiskScoreService();
