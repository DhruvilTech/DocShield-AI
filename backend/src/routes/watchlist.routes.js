// src/routes/watchlist.routes.js
import { Router } from 'express';
import { watchlistController } from '../controllers/watchlist.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { resolveOrganization, requireOrgPermission } from '../middleware/organization.middleware.js';
import { validateBody, validateQuery } from '../middleware/validate.middleware.js';
import { createWatchlistSchema, queryWatchlistSchema } from '../validators/watchlist.validator.js';
import { SYSTEM_PERMISSIONS } from '../config/constants.js';

const router = Router();

// List watchlists
router.get(
  '/',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.WATCHLIST_READ),
  validateQuery(queryWatchlistSchema),
  watchlistController.listWatchlists
);

// Create new watchlist entry
router.post(
  '/',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.WATCHLIST_CREATE),
  validateBody(createWatchlistSchema),
  watchlistController.createWatchlist
);

// Delete / deactivate watchlist entry
router.delete(
  '/:id',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.WATCHLIST_DELETE),
  watchlistController.deleteWatchlist
);

export default router;
