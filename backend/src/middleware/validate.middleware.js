// src/middleware/validate.middleware.js
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';

export const validateBody = (schema) => {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        next(AppError.badRequest('Validation error', 'VALIDATION_FAILED', issues));
      } else {
        next(error);
      }
    }
  };
};

export const validateQuery = (schema) => {
  return (req, res, next) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        next(AppError.badRequest('Invalid query parameters', 'VALIDATION_FAILED', issues));
      } else {
        next(error);
      }
    }
  };
};

export const validate = validateBody;
