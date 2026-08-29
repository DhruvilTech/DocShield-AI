// src/controllers/faceVerification.controller.js
import { faceVerificationService } from '../services/faceVerification/faceVerification.service.js';
import { faceVerificationSchema } from '../validators/faceVerification.validator.js';

export class FaceVerificationController {
  /**
   * Run biometric face verification against document
   * POST /api/v1/documents/:id/face-verification
   */
  async runFaceVerification(req, res, next) {
    try {
      const documentId = req.params.id;
      const organizationId = req.organization.id;
      const validated = faceVerificationSchema.parse(req.body || {});

      const result = await faceVerificationService.verifyFace(
        documentId,
        organizationId,
        validated,
        {
          userId: req.user.userId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

      res.status(200).json({
        success: true,
        message: 'Biometric face verification analysis completed',
        data: {
          faceVerification: result,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get latest face verification record
   * GET /api/v1/documents/:id/face-verification
   */
  async getFaceVerification(req, res, next) {
    try {
      const documentId = req.params.id;
      const organizationId = req.organization.id;
      const versionId = req.query.versionId;

      const result = await faceVerificationService.getLatestVerification(
        documentId,
        organizationId,
        versionId
      );

      res.status(200).json({
        success: true,
        data: {
          faceVerification: result,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const faceVerificationController = new FaceVerificationController();
