// src/routes/health.routes.js
import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';

const router = Router();

router.get('/', healthController.checkHealth);
router.get('/audit', healthController.checkSecurityAudit);

export default router;
