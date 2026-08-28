// src/utils/jwt.js
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';


export class JwtUtil {
  static generateAccessToken(payload) {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRATION,
      issuer: 'docshield-ai',
      audience: 'docshield-client',
    });
  }

  static generateRefreshToken(payload) {
    return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRATION,
      issuer: 'docshield-ai',
      audience: 'docshield-client',
      jwtid: crypto.randomUUID(),
    });
  }

  static verifyAccessToken(token) {
    try {
      return jwt.verify(token, env.JWT_ACCESS_SECRET, {
        issuer: 'docshield-ai',
        audience: 'docshield-client',
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw AppError.unauthorized('Access token has expired', 'AUTH_TOKEN_EXPIRED');
      }
      throw AppError.unauthorized('Invalid access token', 'AUTH_INVALID_TOKEN');
    }
  }

  static verifyRefreshToken(token) {
    try {
      return jwt.verify(token, env.JWT_REFRESH_SECRET, {
        issuer: 'docshield-ai',
        audience: 'docshield-client',
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw AppError.unauthorized('Refresh token has expired', 'AUTH_REFRESH_TOKEN_EXPIRED');
      }
      throw AppError.unauthorized('Invalid refresh token', 'AUTH_INVALID_REFRESH_TOKEN');
    }
  }

  static durationToSeconds(duration) {
    const unit = duration.slice(-1);
    const value = parseInt(duration.slice(0, -1), 10);
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 900;
    }
  }
}
