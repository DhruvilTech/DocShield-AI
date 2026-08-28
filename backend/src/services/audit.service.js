// src/services/audit.service.js
import { auditRepository } from '../repositories/audit.repository.js';
import { logger } from '../utils/logger.js';

export class AuditService {
  async log(entry) {
    try {
      const sanitizedMeta = entry.metadata ? { ...entry.metadata } : {};
      delete sanitizedMeta.password;
      delete sanitizedMeta.passwordHash;
      delete sanitizedMeta.token;
      delete sanitizedMeta.accessToken;
      delete sanitizedMeta.refreshToken;

      await auditRepository.insert({
        ...entry,
        metadata: sanitizedMeta,
      });
    } catch (error) {
      logger.error('Failed to write audit log entry', error);
    }
  }

  async getAuditLogs(page = 1, limit = 20, filters = {}) {
    return auditRepository.list(page, limit, filters);
  }
}

export const auditService = new AuditService();
