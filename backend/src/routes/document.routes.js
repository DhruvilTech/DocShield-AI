// src/routes/document.routes.js
import { Router } from 'express';
import multer from 'multer';
import * as docController from '../controllers/document.controller.js';
import * as processingController from '../controllers/processing.controller.js';
import * as analysisController from '../controllers/analysis.controller.js';
import { tamperingController } from '../controllers/tampering.controller.js';
import { faceVerificationController } from '../controllers/faceVerification.controller.js';
import { riskController } from '../controllers/risk.controller.js';
import { screeningController } from '../controllers/screening.controller.js';
import { verificationController } from '../controllers/verification.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { resolveOrganization } from '../middleware/organization.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { uploadLimiter } from '../middleware/rateLimiter.middleware.js';
import { uploadDocumentSchema, updateDocumentSchema } from '../validators/document.validator.js';
import { triggerProcessingSchema } from '../validators/processing.validator.js';
import { runAnalysisSchema } from '../validators/analysis.validator.js';
import { runTamperingSchema } from '../validators/tampering.validator.js';
import { faceVerificationSchema } from '../validators/faceVerification.validator.js';
import { calculateRiskSchema } from '../validators/risk.validator.js';
import { runScreeningSchema } from '../validators/screening.validator.js';
import { UPLOAD_LIMITS } from '../config/constants.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES },
});

const router = Router();

// Upload document with metadata
router.post(
  '/',
  requireAuth,
  resolveOrganization,
  uploadLimiter,
  upload.single('file'),
  validate(uploadDocumentSchema),
  docController.uploadDocument
);

// List organization documents with filters and pagination
router.get(
  '/',
  requireAuth,
  resolveOrganization,
  docController.listDocuments
);

// Get single document metadata
router.get(
  '/:id',
  requireAuth,
  resolveOrganization,
  docController.getDocumentById
);

// Download document artifact stream
router.get(
  '/:id/download',
  requireAuth,
  resolveOrganization,
  docController.downloadDocument
);

// Preview document inline stream
router.get(
  '/:id/preview',
  requireAuth,
  resolveOrganization,
  docController.previewDocument
);

// Update document metadata
router.patch(
  '/:id',
  requireAuth,
  resolveOrganization,
  validate(updateDocumentSchema),
  docController.updateMetadata
);

// Soft delete / archive document
router.delete(
  '/:id',
  requireAuth,
  resolveOrganization,
  docController.deleteDocument
);

// Upload new version for existing document
router.post(
  '/:id/versions',
  requireAuth,
  resolveOrganization,
  uploadLimiter,
  upload.single('file'),
  docController.uploadNewVersion
);

// List version history
router.get(
  '/:id/versions',
  requireAuth,
  resolveOrganization,
  docController.listVersions
);

// Download specific historical version
router.get(
  '/:id/versions/:versionNumber/download',
  requireAuth,
  resolveOrganization,
  docController.downloadVersion
);

// Phase 5: Trigger Document Processing Pipeline
router.post(
  '/:id/process',
  requireAuth,
  resolveOrganization,
  validate(triggerProcessingSchema),
  processingController.triggerProcessing
);

// Phase 5: Get Document Processing Status
router.get(
  '/:id/processing-status',
  requireAuth,
  resolveOrganization,
  processingController.getProcessingStatus
);

// Phase 5: Get Extracted Text & Structured OCR Data
router.get(
  '/:id/extraction',
  requireAuth,
  resolveOrganization,
  processingController.getExtraction
);

// Phase 6: Run AI Document Intelligence Analysis
router.post(
  '/:id/analysis/run',
  requireAuth,
  resolveOrganization,
  validate(runAnalysisSchema),
  analysisController.runAnalysis
);

// Phase 6: Get Latest AI Document Intelligence Analysis
router.get(
  '/:id/analysis',
  requireAuth,
  resolveOrganization,
  analysisController.getLatestAnalysis
);

// Phase 6: Get AI Security Findings
router.get(
  '/:id/findings',
  requireAuth,
  resolveOrganization,
  analysisController.getFindings
);

// Phase 6: Get AI Risk Indicators
router.get(
  '/:id/risk-indicators',
  requireAuth,
  resolveOrganization,
  analysisController.getRiskIndicators
);

// Phase 7: Run Tampering Forensics Analysis
router.post(
  '/:id/tampering/analyze',
  requireAuth,
  resolveOrganization,
  validate(runTamperingSchema),
  tamperingController.runTamperingAnalysis
);

// Phase 7: Get Tampering Forensics Analysis
router.get(
  '/:id/tampering',
  requireAuth,
  resolveOrganization,
  tamperingController.getTamperingAnalysis
);

// Phase 7: Run Face Verification
router.post(
  '/:id/face-verification',
  requireAuth,
  resolveOrganization,
  validate(faceVerificationSchema),
  faceVerificationController.runFaceVerification
);

// Phase 7: Get Face Verification
router.get(
  '/:id/face-verification',
  requireAuth,
  resolveOrganization,
  faceVerificationController.getFaceVerification
);

// Phase 8: Calculate Risk Score
router.post(
  '/:id/risk/calculate',
  requireAuth,
  resolveOrganization,
  validate(calculateRiskSchema),
  riskController.calculateRisk
);

// Phase 8: Get Risk Score
router.get(
  '/:id/risk',
  requireAuth,
  resolveOrganization,
  riskController.getRiskScore
);

// Phase 8: Run Unified Document Screening Intelligence
router.post(
  '/:id/screening/run',
  requireAuth,
  resolveOrganization,
  validate(runScreeningSchema),
  screeningController.runScreening
);

// Phase 8: Get Unified Document Screening Intelligence
router.get(
  '/:id/screening',
  requireAuth,
  resolveOrganization,
  screeningController.getScreening
);

// Sequential Verification Pipeline Route
router.post(
  '/:id/verify-pipeline',
  requireAuth,
  resolveOrganization,
  verificationController.runVerificationPipeline
);

export default router;
