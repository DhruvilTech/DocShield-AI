// src/errors/AppError.js

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, code = 'BAD_REQUEST', details = null) {
    return new AppError(message, 400, code, details);
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED', details = null) {
    return new AppError(message, 401, code, details);
  }

  static forbidden(message = 'Forbidden - insufficient permissions', code = 'FORBIDDEN', details = null) {
    return new AppError(message, 403, code, details);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND', details = null) {
    return new AppError(message, 404, code, details);
  }

  static conflict(message = 'Resource conflict', code = 'CONFLICT', details = null) {
    return new AppError(message, 409, code, details);
  }

  static unprocessable(message = 'Unprocessable entity', code = 'UNPROCESSABLE_ENTITY', details = null) {
    return new AppError(message, 422, code, details);
  }

  static internal(message = 'Internal server error', code = 'INTERNAL_ERROR', details = null) {
    return new AppError(message, 500, code, details);
  }

  static internalServerError(message = 'Internal server error', code = 'INTERNAL_ERROR', details = null) {
    return new AppError(message, 500, code, details);
  }

  static gatewayTimeout(message = 'Gateway timeout', code = 'GATEWAY_TIMEOUT', details = null) {
    return new AppError(message, 504, code, details);
  }

  static badGateway(message = 'Bad gateway', code = 'BAD_GATEWAY', details = null) {
    return new AppError(message, 502, code, details);
  }
}

