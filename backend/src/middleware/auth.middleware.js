// src/middleware/auth.middleware.js
import { JwtUtil } from '../utils/jwt.js';
import { roleRepository } from '../repositories/role.repository.js';
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

    const permissions = await roleRepository.getUserPermissions(user.id);
    const roles = await roleRepository.getUserRoleSlugs(user.id);

    req.user = {
      userId: user.id,
      email: user.email,
      roles,
      permissions,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required', 'AUTH_REQUIRED'));
    }

    if (req.user.roles.includes('super_admin')) {
      return next();
    }

    const userPermissions = new Set(req.user.permissions);
    const hasAll = requiredPermissions.every((p) => userPermissions.has(p));

    if (!hasAll) {
      return next(
        AppError.forbidden(
          `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`,
          'FORBIDDEN_PERMISSION_DENIED',
          { required: requiredPermissions }
        )
      );
    }

    next();
  };
};

export const requireRole = (...requiredRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required', 'AUTH_REQUIRED'));
    }

    if (req.user.roles.includes('super_admin')) {
      return next();
    }

    const hasRole = requiredRoles.some((r) => req.user.roles.includes(r));
    if (!hasRole) {
      return next(
        AppError.forbidden(
          `Access restricted to roles: ${requiredRoles.join(', ')}`,
          'FORBIDDEN_ROLE_DENIED',
          { required: requiredRoles }
        )
      );
    }

    next();
  };
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
