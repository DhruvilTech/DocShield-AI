// src/controllers/processing.controller.js
import { processingPipelineService } from '../services/processingPipeline.service.js';
import { ResponseUtil } from '../utils/response.js';

export const triggerProcessing = async (req, res, next) => {
  try {
    const job = await processingPipelineService.enqueueProcessing(
      req.params.id,
      req.organization.id,
      req.user.userId,
      req.body,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );

    return ResponseUtil.sendSuccess(
      res,
      { job },
      202,
      'Document processing pipeline queued successfully'
    );
  } catch (error) {
    next(error);
  }
};

export const getProcessingStatus = async (req, res, next) => {
  try {
    const status = await processingPipelineService.getStatus(
      req.params.id,
      req.organization.id
    );

    return ResponseUtil.sendSuccess(res, status);
  } catch (error) {
    next(error);
  }
};

export const getExtraction = async (req, res, next) => {
  try {
    const versionNumber = req.query.versionNumber ? parseInt(req.query.versionNumber, 10) : null;
    const extraction = await processingPipelineService.getExtraction(
      req.params.id,
      req.organization.id,
      versionNumber
    );

    return ResponseUtil.sendSuccess(res, { extraction });
  } catch (error) {
    next(error);
  }
};
