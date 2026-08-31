// src/services/verification/tamperingStage.service.js
import { tamperingDetectorService } from '../tampering/tamperingDetector.service.js';

export class TamperingStageService {
  /**
   * Run Stage 2 Tampering Forensics Detection on the document
   */
  async execute(documentId, organizationId, options = {}, reqMeta = {}) {
    const result = await tamperingDetectorService.analyzeDocument(documentId, organizationId, options, reqMeta);
    const isFailed = result.has_tampering_detected ?? false;

    return {
      status: isFailed ? 'failed' : 'passed',
      should_continue: !isFailed,
      confidence: 1.0 - (result.overall_tampering_score || 0.0),
      reason: isFailed ? 'Tampering anomalies detected in document forensics.' : null,
      result: result
    };
  }
}

export const tamperingStageService = new TamperingStageService();
