// src/controllers/screening.controller.js
import { screeningService } from '../services/screening/screening.service.js';
import { runScreeningSchema } from '../validators/screening.validator.js';

export class ScreeningController {
  /**
   * Execute full document screening intelligence pipeline
   * POST /api/v1/documents/:id/screening/run
   */
  async runScreening(req, res, next) {
    try {
      const documentId = req.params.id;
      const organizationId = req.organization.id;
      const validated = runScreeningSchema.parse(req.body || {});

      const screening = await screeningService.runScreening(
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
        message: 'Document screening intelligence completed successfully',
        data: {
          screening,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get latest screening result for document
   * GET /api/v1/documents/:id/screening
   */
  async getScreening(req, res, next) {
    try {
      const documentId = req.params.id;
      const organizationId = req.organization.id;
      const versionId = req.query.versionId;

      const screening = await screeningService.getLatestScreening(
        documentId,
        organizationId,
        versionId
      );

      res.status(200).json({
        success: true,
        data: {
          screening,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const screeningController = new ScreeningController();
