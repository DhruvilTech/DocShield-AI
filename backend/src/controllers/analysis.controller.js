// src/controllers/analysis.controller.js
import { aiAnalysisService } from '../services/ai/aiAnalysis.service.js';
import { ResponseUtil } from '../utils/response.js';

export const runAnalysis = async (req, res, next) => {
  try {
    const analysis = await aiAnalysisService.runAnalysis(
      req.params.id,
      req.organization.id,
      {
        ...req.body,
        actorUserId: req.user.userId,
      },
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );

    return ResponseUtil.sendSuccess(
      res,
      { analysis },
      200,
      'AI document intelligence analysis executed successfully'
    );
  } catch (error) {
    next(error);
  }
};

export const getLatestAnalysis = async (req, res, next) => {
  try {
    const versionId = req.query.versionId || null;
    const analysis = await aiAnalysisService.getLatestAnalysis(
      req.params.id,
      req.organization.id,
      versionId,
      req.user.userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );

    return ResponseUtil.sendSuccess(res, { analysis });
  } catch (error) {
    next(error);
  }
};

export const getFindings = async (req, res, next) => {
  try {
    const versionId = req.query.versionId || null;
    const findings = await aiAnalysisService.listFindings(
      req.params.id,
      req.organization.id,
      versionId
    );

    return ResponseUtil.sendSuccess(res, { findings });
  } catch (error) {
    next(error);
  }
};

export const getRiskIndicators = async (req, res, next) => {
  try {
    const versionId = req.query.versionId || null;
    const riskIndicators = await aiAnalysisService.listRiskIndicators(
      req.params.id,
      req.organization.id,
      versionId
    );

    return ResponseUtil.sendSuccess(res, { riskIndicators });
  } catch (error) {
    next(error);
  }
};
