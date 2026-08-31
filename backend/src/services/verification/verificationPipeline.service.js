// src/services/verification/verificationPipeline.service.js
import { documentStageService } from './documentStage.service.js';
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
        failedStage = 'document_detection';
        success = false;
      }
    } catch (err) {
      throw err;
    }

    // ── STAGE 2: Image Tampering Detection ──
    if (success) {
      completed_stages.push('tampering');
      
      // Run AI prompt/analysis service first to populate AI findings/risk indicators if Stage 1 passed
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
          failedStage = 'tampering';
          success = false;
        }
      } catch (err) {
        throw err;
      }
    } else {
      // Record SKIPPED tampering analysis
      const skippedTampering = await tamperingRepository.createAnalysis({
        documentId,
        versionId: version.id,
        organizationId,
        status: 'SKIPPED',
        overallTamperingScore: 0.0,
        hasTamperingDetected: false,
        analysisMetadata: { skipped: true, reason: 'Previous stage (document_detection) failed' }
      });
      stages.tampering = {
        status: 'skipped',
        result: skippedTampering
      };
    }

    // ── STAGE 3: Face Detection & Verification ──
    if (success) {
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
          failedStage = 'face_verification';
          success = false;
        }
      } catch (err) {
        throw err;
      }
    } else {
      // Record SKIPPED face verification
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

    let screening;
    if (success) {
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
    } else {
      // Handle early failure: manually write failed screening records to avoid ANALYSIS_NOT_FOUND 404
      const verdict = 'REJECTED';
      const overallRiskScore = riskScore.riskScore || 100;
      const overallRiskLevel = riskScore.riskLevel || 'CRITICAL';
      const summary = `Verification pipeline stopped at stage: ${failedStage}. Document failed validation.`;

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
        recommendations: [`Document rejected at stage: ${failedStage || 'document_detection'}`],
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
        category: failedStage === 'document_detection' ? 'COMPLIANCE' : 'TAMPERING',
        severity: 'CRITICAL',
        title: `${failedStage === 'document_detection' ? 'Validation' : 'Forensic'} Rejection`,
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

      // Retrieve full screening record
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
