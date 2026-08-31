// src/services/verification/verificationPipeline.service.js
import { documentStageService } from './documentStage.service.js';
import { validationStageService } from './validationStage.service.js';
import { tamperingStageService } from './tamperingStage.service.js';
import { faceStageService } from './faceStage.service.js';
import { documentRepository } from '../../repositories/document.repository.js';
import { documentVersionRepository } from '../../repositories/documentVersion.repository.js';
import { tamperingRepository } from '../../repositories/tampering.repository.js';
import { faceVerificationRepository } from '../../repositories/faceVerification.repository.js';
import { screeningRepository } from '../../repositories/screening.repository.js';
import { screeningService } from '../screening/screening.service.js';
import { aiAnalysisService } from '../ai/aiAnalysis.service.js';
import { riskScoreService } from '../risk/riskScore.service.js';
import { auditService } from '../audit.service.js';
import { AppError } from '../../errors/AppError.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';

export class VerificationPipelineService {
  /**
   * Run the multi-stage sequential verification pipeline
   */
  async runPipeline(documentId, organizationId, options = {}, reqMeta = {}) {
    const doc = await documentRepository.findById(documentId, organizationId);
    if (!doc) {
      throw AppError.notFound('Document not found in organization', 'DOCUMENT_NOT_FOUND');
    }

    const targetVersionNumber = options.versionNumber || doc.current_version;
    const version = await documentVersionRepository.findByVersionNumber(documentId, targetVersionNumber);
    if (!version) {
      throw AppError.notFound(`Version ${targetVersionNumber} not found`, 'VERSION_NOT_FOUND');
    }

    const completed_stages = [];
    const stages = {
      document_detection: { status: 'skipped' },
      validation: { status: 'skipped' },
      tampering: { status: 'skipped' },
      face_verification: { status: 'skipped' }
    };

    let pipelineStatus = 'completed';
    let failedStage = null;
    let success = true;

    // ── STAGE 1: Document Detection (AI screening & extraction) ──
    completed_stages.push('document_detection');
    try {
      const docResult = await documentStageService.execute(documentId, organizationId, options);
      stages.document_detection = {
        status: docResult.status,
        confidence: docResult.confidence,
        reason: docResult.reason,
        result: docResult.result
      };

      if (!docResult.should_continue) {
        pipelineStatus = 'stopped';
        if (!failedStage) failedStage = 'document_detection';
        success = false;
      }
    } catch (err) {
      logger.error(`[VerificationPipeline] Document detection error: ${err.message}`);
      stages.document_detection = {
        status: 'failed',
        confidence: 0.0,
        reason: err.message,
        result: null
      };
      pipelineStatus = 'stopped';
      if (!failedStage) failedStage = 'document_detection';
      success = false;
    }

    // ── STAGE 2: Document Standards & Watchlist Validation ──
    completed_stages.push('validation');
    try {
      const valResult = await validationStageService.execute(documentId, organizationId, options, reqMeta);
      stages.validation = {
        status: valResult.status,
        confidence: valResult.confidence,
        reason: valResult.reason,
        result: valResult.result
      };

      if (!valResult.should_continue) {
        pipelineStatus = 'stopped';
        if (!failedStage) failedStage = 'validation';
        success = false;
      }
    } catch (err) {
      logger.error(`[VerificationPipeline] Validation error: ${err.message}`);
      stages.validation = {
        status: 'failed',
        confidence: 0.0,
        reason: err.message,
        result: null
      };
      pipelineStatus = 'stopped';
      if (!failedStage) failedStage = 'validation';
      success = false;
    }

    // ── STAGE 3: Image Tampering Detection (Always Executed) ──
    completed_stages.push('tampering');
    try {
      await aiAnalysisService.runAnalysis(documentId, organizationId, { versionNumber: targetVersionNumber }, reqMeta);
    } catch (err) {
      // Fallback or ignore analysis errors
    }

    try {
      const tampResult = await tamperingStageService.execute(documentId, organizationId, options, reqMeta);
      stages.tampering = {
        status: tampResult.status,
        confidence: tampResult.confidence,
        reason: tampResult.reason,
        result: tampResult.result
      };

      if (!tampResult.should_continue) {
        pipelineStatus = 'stopped';
        if (!failedStage) failedStage = 'tampering';
        success = false;
      }
    } catch (err) {
      logger.error(`[VerificationPipeline] Tampering stage failed: ${err.message}`);
      stages.tampering = {
        status: 'failed',
        confidence: 0.0,
        reason: err.message,
        result: null
      };
      pipelineStatus = 'stopped';
      if (!failedStage) failedStage = 'tampering';
      success = false;
    }

    // ── STAGE 4: Face Detection & Verification ──
    const hasFaceInput = Boolean(
      options.referenceFaceBuffer ||
      options.referenceFaceBase64 ||
      options.simulateMismatch ||
      options.simulateInconclusive ||
      options.simulateNoFace ||
      options.simulateMultipleFaces ||
      options.simulatePoorQuality
    );

    if (success && !options.skipFaceVerification && hasFaceInput) {
      completed_stages.push('face_verification');
      try {
        const faceOptions = {
          versionNumber: targetVersionNumber,
          referenceFaceBuffer: options.referenceFaceBuffer,
          referenceFaceBase64: options.referenceFaceBase64,
          simulateMismatch: options.simulateMismatch,
          simulateInconclusive: options.simulateInconclusive,
          simulateNoFace: options.simulateNoFace,
          simulateMultipleFaces: options.simulateMultipleFaces,
          simulatePoorQuality: options.simulatePoorQuality,
          threshold: options.threshold
        };

        const faceResult = await faceStageService.execute(documentId, organizationId, faceOptions, reqMeta);
        stages.face_verification = {
          status: faceResult.status,
          confidence: faceResult.confidence,
          reason: faceResult.reason,
          result: faceResult.result
        };

        if (!faceResult.should_continue) {
          pipelineStatus = 'stopped';
          if (!failedStage) failedStage = 'face_verification';
          success = false;
        }
      } catch (err) {
        logger.error(`[VerificationPipeline] Face verification error: ${err.message}`);
        stages.face_verification = {
          status: 'failed',
          confidence: 0.0,
          reason: err.message,
          result: null
        };
        pipelineStatus = 'stopped';
        if (!failedStage) failedStage = 'face_verification';
        success = false;
      }
    } else if (success && (!hasFaceInput || options.skipFaceVerification)) {
      // Stages 1-3 passed successfully. Module 4 is ready and waiting for live face capture.
      stages.face_verification = {
        status: 'awaiting_capture',
        reason: 'Modules 1 to 3 verified. Ready for Module 4 live camera capture.',
        result: null
      };
      pipelineStatus = 'stages_1_to_3_completed';
    } else {
      // Record SKIPPED face verification because prior stage failed
      const skippedFace = await faceVerificationRepository.create({
        documentId,
        versionId: version.id,
        organizationId,
        status: 'SKIPPED',
        similarityScore: 0.0,
        confidence: 0.0,
        matchThreshold: 0.75,
        modelName: 'docshield-facenet-v1',
        faceDetectedInDoc: false,
        referenceFaceProvided: Boolean(options.referenceFaceBuffer || options.referenceFaceBase64),
        processingTimeMs: 0,
        metadata: { skipped: true, reason: failedStage ? `Previous stage (${failedStage}) failed` : 'Previous stage failed' }
      });
      stages.face_verification = {
        status: 'skipped',
        result: skippedFace
      };
    }

    // ── Unified Screening & Risk Score Aggregation ──
    const riskScore = await riskScoreService.calculateRiskScore(
      documentId,
      organizationId,
      { versionNumber: targetVersionNumber },
      reqMeta
    );

    let screening = null;
    try {
      screening = await screeningService.runScreening(
        documentId,
        organizationId,
        {
          versionNumber: targetVersionNumber,
          referenceFaceBuffer: options.referenceFaceBuffer,
          forceRerun: false
        },
        reqMeta
      );
    } catch (screeningErr) {
      logger.error(`[VerificationPipeline] Screening intelligence service error: ${screeningErr.message}`);
    }

    if (!screening) {
      // Fallback manual screening creation
      const verdict = success ? 'PASSED' : 'REJECTED';
      const overallRiskScore = riskScore.riskScore || (success ? 10 : 90);
      const overallRiskLevel = riskScore.riskLevel || (success ? 'LOW' : 'CRITICAL');
      const summary = success
        ? 'Document passed all authenticity and verification checks.'
        : `Verification pipeline stopped at stage: ${failedStage || 'validation'}. Document flagged.`;

      const screeningRecord = await screeningRepository.createScreening({
        id: crypto.randomUUID(),
        documentId,
        versionId: version.id,
        organizationId,
        status: 'COMPLETED',
        overallRiskScore,
        overallRiskLevel,
        verdict,
        summary,
        recommendations: [success ? 'Document cleared.' : `Document rejected at stage: ${failedStage || 'validation'}`],
        metadata: {
          analyzedVersion: version.version_number,
          pipeline_status: pipelineStatus,
          failed_stage: failedStage,
          completed_stages,
          stages
        }
      });

      // Add a compliance/tampering factor for the failure
      const reasonMsg = stages[failedStage]?.reason || 'Validation check failed';
      await screeningRepository.createFactor({
        screeningId: screeningRecord.id,
        category: failedStage === 'tampering' ? 'TAMPERING' : 'COMPLIANCE',
        severity: 'CRITICAL',
        title: `${failedStage === 'tampering' ? 'Forensic' : 'Validation'} Rejection`,
        description: reasonMsg,
        impactScore: 40,
        evidence: `Pipeline failed at Stage: ${failedStage}`
      });

      await auditService.log({
        organizationId,
        userId: reqMeta.userId || null,
        action: 'SCREENING_COMPLETED',
        resourceType: 'document_screening',
        resourceId: screeningRecord.id,
        description: `Verification pipeline execution completed: ${verdict}`,
        metadata: {
          documentId,
          versionId: version.id,
          verdict,
          pipeline_status: pipelineStatus,
          failed_stage: failedStage
        },
        ipAddress: reqMeta.ipAddress,
        userAgent: reqMeta.userAgent
      });

      screening = await screeningRepository.findScreeningById(screeningRecord.id, organizationId);
    }

    return {
      success,
      pipeline_status: pipelineStatus,
      completed_stages,
      failed_stage: failedStage,
      stages,
      screening,
      riskScore
    };
  }
}

export const verificationPipelineService = new VerificationPipelineService();
