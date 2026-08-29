// src/services/screening/screening.service.js
import { screeningRepository } from '../../repositories/screening.repository.js';
import { documentVersionRepository } from '../../repositories/documentVersion.repository.js';
import { documentRepository } from '../../repositories/document.repository.js';
import { tamperingDetectorService } from '../tampering/tamperingDetector.service.js';
import { faceVerificationService } from '../faceVerification/faceVerification.service.js';
import { riskScoreService } from '../risk/riskScore.service.js';
import { aiAnalysisService } from '../ai/aiAnalysis.service.js';
import { documentValidationService } from '../validation/documentValidation.service.js';
import { extractionRepository } from '../../repositories/extraction.repository.js';
import { auditService } from '../audit.service.js';
import { AUDIT_ACTIONS, SCREENING_VERDICTS, RISK_LEVELS } from '../../config/constants.js';
import { AppError } from '../../errors/AppError.js';
import crypto from 'crypto';

export class ScreeningService {
  /**
   * Execute full end-to-end unified document screening intelligence (P8 Modules 1 to 4)
   */
  async runScreening(documentId, organizationId, options = {}, reqMeta = {}) {
    const doc = await documentRepository.findById(documentId, organizationId);
    if (!doc) {
      throw AppError.notFound('Document not found in organization', 'DOCUMENT_NOT_FOUND');
    }

    const targetVersionNumber = options.versionNumber || doc.current_version;
    const version = await documentVersionRepository.findByVersionNumber(documentId, targetVersionNumber);
    if (!version) {
      throw AppError.notFound(`Version ${targetVersionNumber} not found`, 'VERSION_NOT_FOUND');
    }

    // 1. Module 1: Ensure extraction exists
    let extraction = await extractionRepository.findByDocument(documentId, organizationId, version.id);
    if (!extraction) {
      throw AppError.badRequest('Extraction required before running screening intelligence pipeline.', 'EXTRACTION_REQUIRED');
    }

    // 2. Module 2: Run Official Document Standards & Watchlist Validation
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

    // 3. AI Analysis & Finding Extraction
    let analysis = await aiAnalysisService.getLatestAnalysis(documentId, organizationId, version.id);
    if (!analysis || options.forceRerun) {
      analysis = await aiAnalysisService.runAnalysis(documentId, organizationId, { versionNumber: targetVersionNumber }, reqMeta);
    }

    // 4. Module 3: Run / Ensure Tampering Forensics (Photo, Text, Stamp, Metadata)
    let tampering = await tamperingDetectorService.getLatestTampering(documentId, organizationId, version.id);
    if (!tampering || options.forceRerun) {
      tampering = await tamperingDetectorService.analyzeDocument(documentId, organizationId, { versionNumber: targetVersionNumber }, reqMeta);
    }

    // 5. Module 4: Run / Ensure Face Verification
    let faceVerification = await faceVerificationService.getLatestVerification(documentId, organizationId, version.id);
    if (!faceVerification || options.forceRerun || options.referenceFaceBuffer) {
      faceVerification = await faceVerificationService.verifyFace(documentId, organizationId, {
        versionNumber: targetVersionNumber,
        referenceFaceBuffer: options.referenceFaceBuffer,
        simulateMismatch: options.simulateMismatch,
        simulateInconclusive: options.simulateInconclusive,
      }, reqMeta);
    }

    // 6. Calculate Risk Score
    const riskRecord = await riskScoreService.calculateRiskScore(documentId, organizationId, { versionNumber: targetVersionNumber }, reqMeta);

    // 7. Determine Unified Screening Verdict & Recommendations
    let verdict = SCREENING_VERDICTS.PASSED;
    const recommendations = [];
    const factorsToCreate = [];

    const hasWatchlistHit = validationResult?.checks?.watchlistCheck?.status === 'HIT_DETECTED';

    if (
      riskRecord.riskScore >= 50 ||
      hasWatchlistHit ||
      (tampering && tampering.has_tampering_detected && tampering.overall_tampering_score >= 0.35) ||
      (faceVerification && faceVerification.status === 'NO_MATCH')
    ) {
      verdict = SCREENING_VERDICTS.REJECTED;
      recommendations.push('Refuse identity clearance: Critical security risk, watchlist alert, or tampering detected.');
      recommendations.push('Immediate escalation to Border Fraud & Forensic Enforcement Unit.');
      if (hasWatchlistHit) {
        recommendations.push('INTERPOL / SLTD Watchlist active hit: Detain travel document for secondary inspection.');
      }
    } else if (
      riskRecord.riskScore >= 25 ||
      (faceVerification && faceVerification.status === 'INCONCLUSIVE') ||
      (validationResult && !validationResult.isValid)
    ) {
      verdict = SCREENING_VERDICTS.REVIEW_REQUIRED;
      recommendations.push('Manual screening review required by Border Control Officer.');
      recommendations.push('Request secondary identity documentation or physical biometric re-enrollment.');
    } else {
      verdict = SCREENING_VERDICTS.PASSED;
      recommendations.push('Document verified authentic within standard tolerance thresholds.');
      recommendations.push('Grant entry / identity clearance and proceed with onboarding workflow.');
    }

    // 8. Compile Screening Factors
    // A. Validation & Watchlist factors
    if (validationResult && validationResult.findings) {
      for (const vf of validationResult.findings) {
        factorsToCreate.push({
          category: 'COMPLIANCE',
          severity: vf.severity,
          title: `Validation: ${vf.title}`,
          description: vf.description,
          impactScore: vf.severity === 'CRITICAL' ? 35 : (vf.severity === 'HIGH' ? 20 : 10),
          evidence: vf.evidence,
        });
      }
    }

    // B. Tampering factors
    if (tampering && tampering.indicators) {
      for (const ind of tampering.indicators) {
        factorsToCreate.push({
          category: 'TAMPERING',
          severity: ind.severity,
          title: `Forensic: ${ind.category.replace(/_/g, ' ')}`,
          description: ind.description,
          impactScore: ind.severity === 'CRITICAL' ? 35 : (ind.severity === 'HIGH' ? 20 : 10),
          evidence: ind.evidence,
        });
      }
    }

    // C. AI findings factors
    if (analysis && analysis.findings) {
      for (const f of analysis.findings) {
        factorsToCreate.push({
          category: 'IDENTITY',
          severity: f.severity,
          title: `Security Finding: ${f.title}`,
          description: f.description,
          impactScore: f.severity === 'CRITICAL' ? 30 : (f.severity === 'HIGH' ? 15 : 5),
          evidence: f.evidence,
        });
      }
    }

    // D. Biometric factors
    if (faceVerification && faceVerification.status !== 'MATCH') {
      factorsToCreate.push({
        category: 'BIOMETRIC',
        severity: faceVerification.status === 'NO_MATCH' ? 'CRITICAL' : 'MEDIUM',
        title: `Biometric Verification: ${faceVerification.status}`,
        description: `Face verification resulted in status ${faceVerification.status} (similarity: ${faceVerification.similarity_score}).`,
        impactScore: faceVerification.status === 'NO_MATCH' ? 25 : 12,
        evidence: `Model ${faceVerification.model_name}, Threshold: ${faceVerification.match_threshold}`,
      });
    }

    const scoreVal = riskRecord.risk_score ?? riskRecord.riskScore ?? 0;
    const levelVal = riskRecord.risk_level ?? riskRecord.riskLevel ?? 'LOW';
    const summary = `Screening intelligence evaluated document "${doc.name}" (v${version.version_number}) with verdict: ${verdict}. Risk score: ${scoreVal}/100 (${levelVal}).`;

    // 9. Persist Screening Record
    const screening = await screeningRepository.createScreening({
      id: crypto.randomUUID(),
      documentId: doc.id,
      versionId: version.id,
      organizationId,
      status: 'COMPLETED',
      overallRiskScore: scoreVal,
      overallRiskLevel: levelVal,
      verdict,
      summary,
      recommendations,
      metadata: {
        analyzedVersion: version.version_number,
        tamperingScore: tampering ? tampering.overall_tampering_score : 0,
        faceStatus: faceVerification ? faceVerification.status : 'N/A',
        validationStatus: validationResult?.isValid ? 'PASSED' : 'FLAGGED',
        watchlistStatus: validationResult?.checks?.watchlistCheck?.status || 'CLEAR',
        totalFactorsCount: factorsToCreate.length,
      },
    });

    // 10. Persist Factors
    for (const factor of factorsToCreate) {
      await screeningRepository.createFactor({
        screeningId: screening.id,
        category: factor.category,
        severity: factor.severity,
        title: factor.title,
        description: factor.description,
        impactScore: factor.impactScore,
        evidence: factor.evidence,
      });
    }

    // 11. Audit log
    await auditService.log({
      organizationId,
      userId: reqMeta.userId || null,
      action: AUDIT_ACTIONS.SCREENING_COMPLETED,
      resourceType: 'document_screening',
      resourceId: screening.id,
      description: `Screening intelligence completed for "${doc.name}" v${version.version_number}: ${verdict} (Score: ${riskRecord.riskScore})`,
      metadata: {
        documentId: doc.id,
        versionId: version.id,
        verdict,
        overallRiskScore: riskRecord.riskScore,
        overallRiskLevel: riskRecord.riskLevel,
        factorsCount: factorsToCreate.length,
      },
      ipAddress: reqMeta.ipAddress,
      userAgent: reqMeta.userAgent,
    });

    return screeningRepository.findScreeningById(screening.id, organizationId);
  }

  /**
   * Get latest screening result for a document
   */
  async getLatestScreening(documentId, organizationId, versionId = null) {
    const doc = await documentRepository.findById(documentId, organizationId);
    if (!doc) {
      throw AppError.notFound('Document not found in organization', 'DOCUMENT_NOT_FOUND');
    }

    return screeningRepository.findLatestByDocument(documentId, organizationId, versionId);
  }
}

export const screeningService = new ScreeningService();
