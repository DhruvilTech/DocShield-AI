// src/routes/admin.routes.js
import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// Admin telemetry and mission command routes require authentication
router.use(requireAuth);

router.get('/telemetry', (req, res, next) => adminController.getSystemTelemetry(req, res, next));
router.get('/overview', (req, res, next) => adminController.getAdminOverview(req, res, next));

export default router;
