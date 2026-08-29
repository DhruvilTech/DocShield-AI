// src/validators/watchlist.validator.js
import { z } from 'zod';

export const createWatchlistSchema = z.object({
  documentNumber: z.string().min(3, 'Document number must be at least 3 characters').max(100),
  fullName: z.string().max(255).optional(),
  nationality: z.string().max(10).optional(),
  reason: z.string().min(3, 'Reason is required').max(255),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('CRITICAL'),
  listedBy: z.string().max(255).default('BORDER_AUTHORITY'),
  metadata: z.record(z.any()).optional(),
});

export const queryWatchlistSchema = z.object({
  search: z.string().optional(),
  page: z.union([z.string().regex(/^\d+$/).transform(Number), z.number()]).optional().default(1),
  limit: z.union([z.string().regex(/^\d+$/).transform(Number), z.number()]).optional().default(50),
});
