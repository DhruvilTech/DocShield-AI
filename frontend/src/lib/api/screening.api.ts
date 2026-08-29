// src/lib/api/screening.api.ts
import { apiClient } from './client';
import { DocumentScreening } from '../../types';

export interface RunScreeningOptions {
  versionNumber?: number;
  forceRerun?: boolean;
  simulateMismatch?: boolean;
  simulateInconclusive?: boolean;
}

export const screeningApi = {
  /**
   * Run full end-to-end unified document screening intelligence
   */
  runScreening: async (
    documentId: string,
    options: RunScreeningOptions = {}
  ): Promise<DocumentScreening> => {
    const res = await apiClient.post<{ screening: DocumentScreening }>(
      `/documents/${documentId}/screening/run`,
      options
    );
    return res.data.screening;
  },

  /**
   * Get latest screening intelligence result
   */
  getScreening: async (
    documentId: string,
    versionId?: string
  ): Promise<DocumentScreening> => {
    const params = versionId ? { versionId } : undefined;
    const res = await apiClient.get<{ screening: DocumentScreening }>(
      `/documents/${documentId}/screening`,
      { params }
    );
    return res.data.screening;
  },
};
