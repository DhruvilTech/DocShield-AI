// src/middleware/auth.middleware.js
import { JwtUtil } from '../utils/jwt.js';
import { userRepository } from '../repositories/user.repository.js';
import { AppError } from '../errors/AppError.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError.unauthorized('Authentication token missing or invalid', 'AUTH_TOKEN_MISSING');
    }

    const token = authHeader.split(' ')[1];
    const payload = JwtUtil.verifyAccessToken(token);

    const user = await userRepository.findById(payload.userId);
    if (!user || user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      throw AppError.unauthorized('User account has been disabled or removed', 'AUTH_ACCOUNT_DISABLED');
    }

    req.user = {
      userId: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      roles: [],
      permissions: [],
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const payload = JwtUtil.verifyAccessToken(token);
      req.user = payload;
    }
  } catch (err) {
    // Ignore invalid optional tokens
  }
  next();
};
