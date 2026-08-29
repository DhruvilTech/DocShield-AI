// src/controllers/watchlist.controller.js
import { watchlistService } from '../services/watchlist.service.js';
import { ResponseUtil } from '../utils/response.js';

export class WatchlistController {
  listWatchlists = async (req, res, next) => {
    try {
      const organizationId = req.organization?.id || null;
      const { search, page, limit } = req.query;
      const result = await watchlistService.listWatchlists({ organizationId, search, page, limit });
      return ResponseUtil.sendPaginated(res, result.data, {
        total: result.total,
        page: Number(page) || 1,
        limit: Number(limit) || 50,
      }, Number(page) || 1, Number(limit) || 50, 'Watchlists retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  createWatchlist = async (req, res, next) => {
    try {
      const organizationId = req.organization?.id || null;
      const reqMeta = {
        userId: req.user?.id || req.user?.userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };
      const entry = await watchlistService.createWatchlistEntry(req.body, organizationId, reqMeta);
      return ResponseUtil.sendSuccess(res, entry, 'Watchlist alert registered successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  deleteWatchlist = async (req, res, next) => {
    try {
      const organizationId = req.organization?.id || null;
      const { id } = req.params;
      const reqMeta = {
        userId: req.user?.id || req.user?.userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };
      const result = await watchlistService.deleteWatchlistEntry(id, organizationId, reqMeta);
      return ResponseUtil.sendSuccess(res, result, 'Watchlist entry deactivated');
    } catch (err) {
      next(err);
    }
  };
}

export const watchlistController = new WatchlistController();
