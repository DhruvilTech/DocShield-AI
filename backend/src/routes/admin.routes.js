// src/routes/admin.routes.js
import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// All admin routes strictly require valid authentication & super_admin role
router.use(requireAuth);
router.use(requireSuperAdmin);

router.get('/telemetry', (req, res, next) => adminController.getSystemTelemetry(req, res, next));
router.get('/overview', (req, res, next) => adminController.getAdminOverview(req, res, next));

export default router;
