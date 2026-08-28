// src/lib/api/analysis.api.ts
import { apiClient } from './client';
import { DocumentAnalysis, AnalysisFinding, RiskIndicator } from '../../types';

export interface RunAnalysisOptions {
  versionNumber?: number;
  provider?: 'heuristic' | 'gemini' | 'openai' | 'mock';
}

export const analysisApi = {
  /**
   * Run AI document intelligence analysis on-demand
   */
  runAnalysis: async (
    documentId: string,
    options: RunAnalysisOptions = {}
  ): Promise<DocumentAnalysis> => {
    const res = await apiClient.post<{ analysis: DocumentAnalysis }>(
      `/documents/${documentId}/analysis/run`,
      options
    );
    return res.data.analysis;
  },

  /**
   * Get latest AI intelligence analysis summary, findings and risk indicators
   */
  getLatestAnalysis: async (
    documentId: string,
    versionId?: string
  ): Promise<DocumentAnalysis> => {
    const params = versionId ? { versionId } : undefined;
    const res = await apiClient.get<{ analysis: DocumentAnalysis }>(
      `/documents/${documentId}/analysis`,
      { params }
    );
    return res.data.analysis;
  },

  /**
   * List security findings for document
   */
  getFindings: async (
    documentId: string,
    versionId?: string
  ): Promise<AnalysisFinding[]> => {
    const params = versionId ? { versionId } : undefined;
    const res = await apiClient.get<{ findings: AnalysisFinding[] }>(
      `/documents/${documentId}/findings`,
      { params }
    );
    return res.data.findings;
  },

  /**
   * List risk indicators for document
   */
  getRiskIndicators: async (
    documentId: string,
    versionId?: string
  ): Promise<RiskIndicator[]> => {
    const params = versionId ? { versionId } : undefined;
    const res = await apiClient.get<{ riskIndicators: RiskIndicator[] }>(
      `/documents/${documentId}/risk-indicators`,
      { params }
    );
    return res.data.riskIndicators;
  },
};
