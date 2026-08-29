// src/controllers/tampering.controller.js
import { tamperingDetectorService } from '../services/tampering/tamperingDetector.service.js';
import { runTamperingSchema } from '../validators/tampering.validator.js';

export class TamperingController {
  /**
   * Run on-demand tampering forensics
   * POST /api/v1/documents/:id/tampering/analyze
   */
  async runTamperingAnalysis(req, res, next) {
    try {
      const documentId = req.params.id;
      const organizationId = req.organization.id;
      const validated = runTamperingSchema.parse(req.body || {});

      const analysis = await tamperingDetectorService.analyzeDocument(
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
        message: 'Document tampering forensics completed',
        data: {
          analysis,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get latest tampering analysis for document
   * GET /api/v1/documents/:id/tampering
   */
  async getTamperingAnalysis(req, res, next) {
    try {
      const documentId = req.params.id;
      const organizationId = req.organization.id;
      const versionId = req.query.versionId;

      const analysis = await tamperingDetectorService.getLatestTampering(
        documentId,
        organizationId,
        versionId
      );

      res.status(200).json({
        success: true,
        data: {
          analysis,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const tamperingController = new TamperingController();
