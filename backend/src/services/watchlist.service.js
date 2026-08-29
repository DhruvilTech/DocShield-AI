// src/services/watchlist.service.js
import { watchlistRepository } from '../repositories/watchlist.repository.js';
import { auditService } from './audit.service.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import { AppError } from '../errors/AppError.js';
import crypto from 'crypto';

export class WatchlistService {
  /**
   * Search watchlist entries
   */
  async listWatchlists(options = {}) {
    const { organizationId, search, page = 1, limit = 50 } = options;
    const offset = (Number(page) - 1) * Number(limit);
    return watchlistRepository.list({ organizationId, search, limit, offset });
  }

  /**
   * Add a new travel document or person to watchlist
   */
  async createWatchlistEntry(data, organizationId, reqMeta = {}) {
    const id = crypto.randomUUID();
    const entry = await watchlistRepository.create({
      id,
      organizationId,
      documentNumber: data.documentNumber,
      fullName: data.fullName,
      nationality: data.nationality,
      reason: data.reason,
      riskLevel: data.riskLevel,
      listedBy: data.listedBy,
      metadata: data.metadata,
    });

    await auditService.log({
      organizationId,
      userId: reqMeta.userId || null,
      action: AUDIT_ACTIONS.WATCHLIST_ENTRY_CREATED,
      resourceType: 'watchlist',
      resourceId: id,
      description: `Watchlist alert created for doc #${data.documentNumber} (${data.reason})`,
      metadata: { documentNumber: data.documentNumber, reason: data.reason, riskLevel: data.riskLevel },
      ipAddress: reqMeta.ipAddress,
      userAgent: reqMeta.userAgent,
    });

    return entry;
  }

  /**
   * Deactivate / remove entry from watchlist
   */
  async deleteWatchlistEntry(id, organizationId, reqMeta = {}) {
    const existing = await watchlistRepository.findById(id, organizationId);
    if (!existing) {
      throw AppError.notFound('Watchlist entry not found', 'WATCHLIST_NOT_FOUND');
    }

    await watchlistRepository.deactivate(id, organizationId);

    await auditService.log({
      organizationId,
      userId: reqMeta.userId || null,
      action: AUDIT_ACTIONS.WATCHLIST_ENTRY_DELETED,
      resourceType: 'watchlist',
      resourceId: id,
      description: `Watchlist alert revoked for doc #${existing.document_number}`,
      metadata: { documentNumber: existing.document_number },
      ipAddress: reqMeta.ipAddress,
      userAgent: reqMeta.userAgent,
    });

    return { success: true, message: 'Watchlist entry deactivated' };
  }
}

export const watchlistService = new WatchlistService();
