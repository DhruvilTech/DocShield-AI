// src/lib/api/tampering.api.ts
import { apiClient } from './client';
import { TamperingAnalysis, ForensicAnalysisResponse } from '../../types';

export const tamperingApi = {
  /**
   * Run standalone direct file upload tampering forensics
   */
  analyzeDirect: async (
    file: File,
    options: { saveDebug?: boolean } = {}
  ): Promise<ForensicAnalysisResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    if (options.saveDebug) {
      formData.append('saveDebug', 'true');
    }

    const res = await apiClient<{ success: boolean; data: ForensicAnalysisResponse }>(
      '/image-tampering/analyze',
      {
        method: 'POST',
        body: formData,
      }
    );
    return res.data ?? (res as any);
  },

  /**
   * Run on-demand tampering and forensic analysis
   */
  runTamperingAnalysis: async (
    documentId: string,
    options: { versionNumber?: number } = {}
  ): Promise<TamperingAnalysis> => {
    const res = await apiClient<{ success: boolean; data: { analysis: TamperingAnalysis } }>(
      `/documents/${documentId}/tampering/analyze`,
      { method: 'POST', body: JSON.stringify(options) }
    );
    return res.data?.analysis ?? (res as any)?.analysis ?? (res as any);
  },

  /**
   * Alias for runTamperingAnalysis
   */
  analyzeDocument: async (
    documentId: string,
    options: { versionNumber?: number } = {}
  ): Promise<TamperingAnalysis> => {
    return tamperingApi.runTamperingAnalysis(documentId, options);
  },

  /**
   * Get latest tampering analysis results
   */
  getTamperingAnalysis: async (
    documentId: string,
    versionId?: string
  ): Promise<TamperingAnalysis> => {
    const params = versionId ? { versionId } : undefined;
    const res = await apiClient<{ success: boolean; data: { analysis: TamperingAnalysis } }>(
      `/documents/${documentId}/tampering`,
      { params }
    );
    return res.data?.analysis ?? (res as any)?.analysis ?? (res as any);
  },
};

