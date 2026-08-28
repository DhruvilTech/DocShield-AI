// src/middleware/rateLimiter.middleware.js
import rateLimit from 'express-rate-limit';
import { ResponseUtil } from '../utils/response.js';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return ResponseUtil.sendError(
      res,
      'Too many authentication attempts. Please try again in 15 minutes.',
      'AUTH_RATE_LIMIT_EXCEEDED',
      429
    );
  },
});

export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // 60 uploads per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return ResponseUtil.sendError(
      res,
      'Upload rate limit exceeded. Please wait a few minutes before uploading more documents.',
      'UPLOAD_RATE_LIMIT_EXCEEDED',
      429
    );
  },
});

export const invitationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 invitations per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return ResponseUtil.sendError(
      res,
      'Invitation rate limit exceeded. Please wait before dispatching additional invitations.',
      'INVITATION_RATE_LIMIT_EXCEEDED',
      429
    );
  },
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return ResponseUtil.sendError(
      res,
      'Too many requests from this IP. Please try again later.',
      'RATE_LIMIT_EXCEEDED',
      429
    );
  },
});
