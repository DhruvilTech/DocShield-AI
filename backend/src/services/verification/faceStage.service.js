// src/services/verification/faceStage.service.js
import { faceVerificationService } from '../faceVerification/faceVerification.service.js';

export class FaceStageService {
  /**
   * Run Stage 3 Biometric Face Verification on the document and live images
   */
  async execute(documentId, organizationId, options = {}, reqMeta = {}) {
    const result = await faceVerificationService.verifyFace(documentId, organizationId, options, reqMeta);
    const isPassed = result.status === 'MATCH';

    return {
      status: isPassed ? 'passed' : 'failed',
      should_continue: isPassed,
      confidence: result.similarity_score || 0.0,
      reason: isPassed ? null : `Biometric comparison failed with status: ${result.status}`,
      result: result
    };
  }
}

export const faceStageService = new FaceStageService();
