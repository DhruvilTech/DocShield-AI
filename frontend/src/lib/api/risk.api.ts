// src/lib/api/risk.api.ts
import { apiClient } from './client';
import { RiskScore } from '../../types';

export const riskApi = {
  /**
   * Calculate or recalculate document multi-factor risk score
   */
  calculateRisk: async (
    documentId: string,
    options: { versionNumber?: number } = {}
  ): Promise<RiskScore> => {
    const res = await apiClient.post<{ riskScore: RiskScore }>(
      `/documents/${documentId}/risk/calculate`,
      options
    );
    return res.data.riskScore;
  },

  /**
   * Get latest calculated risk score
   */
  getRiskScore: async (
    documentId: string,
    versionId?: string
  ): Promise<RiskScore> => {
    const params = versionId ? { versionId } : undefined;
    const res = await apiClient.get<{ riskScore: RiskScore }>(
      `/documents/${documentId}/risk`,
      { params }
    );
    return res.data.riskScore;
  },
};
