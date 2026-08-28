// src/routes/document.routes.js
import { Router } from 'express';
import multer from 'multer';
import * as docController from '../controllers/document.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { resolveOrganization, requireOrgPermission } from '../middleware/organization.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { uploadLimiter } from '../middleware/rateLimiter.middleware.js';
import { uploadDocumentSchema, updateDocumentSchema } from '../validators/document.validator.js';
import { SYSTEM_PERMISSIONS, UPLOAD_LIMITS } from '../config/constants.js';

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
  requireOrgPermission(SYSTEM_PERMISSIONS.DOCUMENTS_CREATE),
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
  requireOrgPermission(SYSTEM_PERMISSIONS.DOCUMENTS_READ),
  docController.listDocuments
);

// Get single document metadata
router.get(
  '/:id',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.DOCUMENTS_READ),
  docController.getDocumentById
);

// Download document artifact stream
router.get(
  '/:id/download',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.DOCUMENTS_DOWNLOAD),
  docController.downloadDocument
);

// Preview document inline stream
router.get(
  '/:id/preview',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.DOCUMENTS_READ),
  docController.previewDocument
);

// Update document metadata
router.patch(
  '/:id',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.DOCUMENTS_UPDATE),
  validate(updateDocumentSchema),
  docController.updateMetadata
);

// Soft delete / archive document
router.delete(
  '/:id',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.DOCUMENTS_DELETE),
  docController.deleteDocument
);

// Upload new version for existing document
router.post(
  '/:id/versions',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.DOCUMENTS_UPLOAD_VERSION),
  uploadLimiter,
  upload.single('file'),
  docController.uploadNewVersion
);

// List version history
router.get(
  '/:id/versions',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.DOCUMENTS_VIEW_VERSIONS),
  docController.listVersions
);

// Download specific historical version
router.get(
  '/:id/versions/:versionNumber/download',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.DOCUMENTS_DOWNLOAD),
  docController.downloadVersion
);

export default router;
