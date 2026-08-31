// src/controllers/verification.controller.js
import { verificationPipelineService } from '../services/verification/verificationPipeline.service.js';

export class VerificationController {
  /**
   * Run the sequential multi-stage document verification pipeline
   * POST /api/v1/documents/:id/verify-pipeline
   */
  async runVerificationPipeline(req, res, next) {
    try {
      const documentId = req.params.id;
      const organizationId = req.organization.id;
      const options = req.body || {};

      const result = await verificationPipelineService.runPipeline(
        documentId,
        organizationId,
        options,
        {
          userId: req.user?.userId || null,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] || '',
        }
      );

      res.status(200).json({
        success: true,
        message: 'Sequential document verification pipeline completed',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const verificationController = new VerificationController();
