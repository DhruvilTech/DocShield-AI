// src/lib/api/audit.api.ts
import { apiClient } from './client';
import { AuditLog } from '../../types';

export const auditApi = {
  listAuditLogs: (params?: {
    page?: number;
    limit?: number;
    actorUserId?: string;
    action?: string;
    resourceType?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) => {
    return apiClient<{
      success: boolean;
      data: AuditLog[];
      pagination: { total: number; page: number; limit: number; totalPages: number };
    }>('/audit-logs', { params });
  },
};
