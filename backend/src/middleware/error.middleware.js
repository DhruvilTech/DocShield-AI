// src/middleware/error.middleware.js
import { AppError } from '../errors/AppError.js';
import { ResponseUtil } from '../utils/response.js';
import { logger } from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    logger.warn(`[AppError] [${err.code}] ${err.message}`, {
      path: req.path,
      method: req.method,
      ip: req.ip,
      statusCode: err.statusCode,
      details: err.details,
    });

    return ResponseUtil.sendError(res, err.message, err.code, err.statusCode, err.details);
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return ResponseUtil.sendError(res, 'Malformed JSON payload in request body', 'INVALID_JSON', 400);
  }

  logger.error(`[UnhandledError] ${err.message}`, err);

  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  return ResponseUtil.sendError(res, message, 'INTERNAL_SERVER_ERROR', 500);
};

export const notFoundHandler = (req, res) => {
  return ResponseUtil.sendError(res, `Resource not found at route: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND', 404);
};
