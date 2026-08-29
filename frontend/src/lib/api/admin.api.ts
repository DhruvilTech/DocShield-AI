// src/lib/api/admin.api.ts
import { apiClient } from './client';

export interface SystemTelemetry {
  timestamp: string;
  latencyMs: number;
  system: {
    platform: string;
    arch: string;
    hostname: string;
    osRelease: string;
    nodeVersion: string;
    processUptimeSeconds: number;
    osUptimeSeconds: number;
    cpu: {
      model: string;
      cores: number;
      loadAvg1m: number;
      loadAvg5m: number;
      loadAvg15m: number;
    };
    memory: {
      totalMB: number;
      usedMB: number;
      freeMB: number;
      usagePercent: number;
      heapUsedMB: number;
      heapTotalMB: number;
      rssMB: number;
    };
  };
  enclave: {
    teeStatus: string;
    enclaveType: string;
    cryptoStandard: string;
    zeroPlaintextLeaks: boolean;
    fipsCompliance: string;
  };
  aiClusters: Array<{
    name: string;
    version: string;
    status: string;
    avgLatencyMs: number;
    throughputFps: number;
  }>;
  metrics: {
    totalOrganizations: number;
    totalUsers: number;
    totalDocuments: number;
    totalScreenings: number;
    totalFraudCatches: number;
    totalActiveWatchlists: number;
    totalFaceVerifications: number;
    biometricSuccessRatePercent: number;
    totalAuditEvents: number;
  };
}

export interface AdminOverview {
  recentScreenings: Array<{
    id: string;
    document_id: string;
    document_name?: string;
    document_type?: string;
    organization_name?: string;
    verdict: string;
    overall_risk_score: number;
    overall_risk_level: string;
    created_at: string;
  }>;
  recentAudits: Array<{
    id: string;
    action: string;
    resource_type: string;
    description: string;
    created_at: string;
    ip_address?: string;
    user_name?: string;
    user_email?: string;
  }>;
  topWatchlists: Array<{
    id: string;
    full_name?: string;
    document_number?: string;
    nationality?: string;
    reason: string;
    risk_level: string;
    listed_by?: string;
    created_at: string;
  }>;
}

export const adminApi = {
  getTelemetry: async (): Promise<SystemTelemetry> => {
    const res = await apiClient<{ success: boolean; data: SystemTelemetry }>('/admin/telemetry');
    return res.data;
  },

  getOverview: async (): Promise<AdminOverview> => {
    const res = await apiClient<{ success: boolean; data: AdminOverview }>('/admin/overview');
    return res.data;
  },
};
