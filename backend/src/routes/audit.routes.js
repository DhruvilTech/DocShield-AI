// src/routes/audit.routes.js
import { Router } from 'express';
import { auditController } from '../controllers/audit.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { SYSTEM_PERMISSIONS } from '../config/constants.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  requirePermission(SYSTEM_PERMISSIONS.AUDIT_LOGS_READ),
  auditController.listAuditLogs
);

export default router;
