// src/routes/audit.routes.js
import { Router } from 'express';
import { auditController } from '../controllers/audit.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', requireAuth, auditController.listAuditLogs);

export default router;
