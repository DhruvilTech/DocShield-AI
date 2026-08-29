// src/lib/api/tampering.api.ts
import { apiClient } from './client';
import { TamperingAnalysis } from '../../types';

export const tamperingApi = {
  /**
   * Run on-demand tampering and forensic analysis
   */
  runTamperingAnalysis: async (
    documentId: string,
    options: { versionNumber?: number } = {}
  ): Promise<TamperingAnalysis> => {
    const res = await apiClient.post<{ analysis: TamperingAnalysis }>(
      `/documents/${documentId}/tampering/analyze`,
      options
    );
    return res.data.analysis;
  },

  /**
   * Get latest tampering analysis results
   */
  getTamperingAnalysis: async (
    documentId: string,
    versionId?: string
  ): Promise<TamperingAnalysis> => {
    const params = versionId ? { versionId } : undefined;
    const res = await apiClient.get<{ analysis: TamperingAnalysis }>(
      `/documents/${documentId}/tampering`,
      { params }
    );
    return res.data.analysis;
  },
};
