// src/controllers/risk.controller.js
import { riskScoreService } from '../services/risk/riskScore.service.js';
import { calculateRiskSchema } from '../validators/risk.validator.js';

export class RiskController {
  /**
   * Calculate multi-factor risk score
   * POST /api/v1/documents/:id/risk/calculate
   */
  async calculateRisk(req, res, next) {
    try {
      const documentId = req.params.id;
      const organizationId = req.organization.id;
      const validated = calculateRiskSchema.parse(req.body || {});

      const riskRecord = await riskScoreService.calculateRiskScore(
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
        message: 'Multi-factor risk score calculated successfully',
        data: {
          riskScore: riskRecord,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get latest risk score
   * GET /api/v1/documents/:id/risk
   */
  async getRiskScore(req, res, next) {
    try {
      const documentId = req.params.id;
      const organizationId = req.organization.id;
      const versionId = req.query.versionId;

      const riskRecord = await riskScoreService.getLatestRiskScore(
        documentId,
        organizationId,
        versionId
      );

      res.status(200).json({
        success: true,
        data: {
          riskScore: riskRecord,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const riskController = new RiskController();
