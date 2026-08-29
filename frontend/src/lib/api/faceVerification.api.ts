// src/lib/api/faceVerification.api.ts
import { apiClient } from './client';
import { FaceVerification } from '../../types';

export interface FaceVerificationOptions {
  versionNumber?: number;
  referenceFaceBase64?: string;
  threshold?: number;
  livenessResult?: {
    status: 'PASS' | 'FAIL';
    confidence?: number;
    reason?: string | null;
    stages_completed?: string[];
  };
  livenessVideoBase64?: string;
  simulateMismatch?: boolean;
  simulateInconclusive?: boolean;
  simulateNoFace?: boolean;
  simulateMultipleFaces?: boolean;
  simulatePoorQuality?: boolean;
  simulateLivenessFail?: boolean;
}

export const faceVerificationApi = {
  /**
   * Run biometric face detection, liveness, and verification
   */
  verifyFace: async (
    documentId: string,
    options: FaceVerificationOptions = {}
  ): Promise<FaceVerification> => {
    const res = await apiClient.post<{ success: boolean; data: { faceVerification: FaceVerification } }>(
      `/documents/${documentId}/face-verification`,
      options
    );
    return res.data?.faceVerification ?? (res as any)?.faceVerification ?? (res as any);
  },

  /**
   * Get latest face verification result
   */
  getFaceVerification: async (
    documentId: string,
    versionId?: string
  ): Promise<FaceVerification> => {
    const params = versionId ? { versionId } : undefined;
    const res = await apiClient.get<{ success: boolean; data: { faceVerification: FaceVerification } }>(
      `/documents/${documentId}/face-verification`,
      { params }
    );
    return res.data?.faceVerification ?? (res as any)?.faceVerification ?? (res as any);
  },
};
