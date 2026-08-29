// src/lib/api/faceVerification.api.ts
import { apiClient } from './client';
import { FaceVerification } from '../../types';

export interface FaceVerificationOptions {
  versionNumber?: number;
  referenceFaceBase64?: string;
  simulateMismatch?: boolean;
  simulateInconclusive?: boolean;
}

export const faceVerificationApi = {
  /**
   * Run biometric face detection and verification
   */
  verifyFace: async (
    documentId: string,
    options: FaceVerificationOptions = {}
  ): Promise<FaceVerification> => {
    const res = await apiClient.post<{ faceVerification: FaceVerification }>(
      `/documents/${documentId}/face-verification`,
      options
    );
    return res.data.faceVerification;
  },

  /**
   * Get latest face verification result
   */
  getFaceVerification: async (
    documentId: string,
    versionId?: string
  ): Promise<FaceVerification> => {
    const params = versionId ? { versionId } : undefined;
    const res = await apiClient.get<{ faceVerification: FaceVerification }>(
      `/documents/${documentId}/face-verification`,
      { params }
    );
    return res.data.faceVerification;
  },
};
