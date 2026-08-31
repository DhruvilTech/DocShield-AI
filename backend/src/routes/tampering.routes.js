// src/routes/tampering.routes.js
import { Router } from 'express';
import multer from 'multer';
import { tamperingController } from '../controllers/tampering.controller.js';
import { UPLOAD_LIMITS } from '../config/constants.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_LIMITS?.MAX_FILE_SIZE_BYTES || 25 * 1024 * 1024 },
});

const router = Router();

/**
 * @route   POST /api/image-tampering/analyze (or /api/v1/tampering/analyze)
 * @desc    Run standalone image/PDF tampering forensics
 * @access  Public / Authenticated
 */
router.post('/analyze', upload.single('file'), (req, res, next) => tamperingController.analyzeDirect(req, res, next));
router.post('/', upload.single('file'), (req, res, next) => tamperingController.analyzeDirect(req, res, next));

export default router;
