// src/routes/watchlist.routes.js
import { Router } from 'express';
import { watchlistController } from '../controllers/watchlist.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { resolveOrganization } from '../middleware/organization.middleware.js';
import { validateBody, validateQuery } from '../middleware/validate.middleware.js';
import { createWatchlistSchema, queryWatchlistSchema } from '../validators/watchlist.validator.js';

const router = Router();

// List watchlists
router.get(
  '/',
  requireAuth,
  resolveOrganization,
  validateQuery(queryWatchlistSchema),
  watchlistController.listWatchlists
);

// Create new watchlist entry
router.post(
  '/',
  requireAuth,
  resolveOrganization,
  validateBody(createWatchlistSchema),
  watchlistController.createWatchlist
);

// Delete / deactivate watchlist entry
router.delete(
  '/:id',
  requireAuth,
  resolveOrganization,
  watchlistController.deleteWatchlist
);

export default router;
