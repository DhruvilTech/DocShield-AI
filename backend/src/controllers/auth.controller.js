// src/controllers/auth.controller.js
import { authService } from '../services/auth.service.js';
import { ResponseUtil } from '../utils/response.js';
import { REFRESH_COOKIE_CONFIG, COOKIE_OPTIONS } from '../config/constants.js';

export class AuthController {
  getMeta(req) {
    return {
      ipAddress: req.headers['x-forwarded-for'] || req.ip,
      userAgent: req.headers['user-agent'],
    };
  }

  register = async (req, res, next) => {
    try {
      const result = await authService.register(req.body, this.getMeta(req));
      res.cookie(COOKIE_OPTIONS.REFRESH_TOKEN, result.tokens.refreshToken, REFRESH_COOKIE_CONFIG);

      ResponseUtil.sendSuccess(
        res,
        result,
        'Account registered successfully. Please verify your email.',
        201
      );
    } catch (error) {
      next(error);
    }
  };

  login = async (req, res, next) => {
    try {
      const result = await authService.login(req.body, this.getMeta(req));
      res.cookie(COOKIE_OPTIONS.REFRESH_TOKEN, result.tokens.refreshToken, REFRESH_COOKIE_CONFIG);

      ResponseUtil.sendSuccess(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req, res, next) => {
    try {
      const rawRefreshToken = req.cookies?.[COOKIE_OPTIONS.REFRESH_TOKEN] || req.body?.refreshToken;
      if (!rawRefreshToken) {
        return ResponseUtil.sendError(res, 'Refresh token missing', 'AUTH_TOKEN_MISSING', 401);
      }

      const tokens = await authService.refreshToken(rawRefreshToken, this.getMeta(req));
      res.cookie(COOKIE_OPTIONS.REFRESH_TOKEN, tokens.refreshToken, REFRESH_COOKIE_CONFIG);

      ResponseUtil.sendSuccess(res, { tokens }, 'Token refreshed successfully');
    } catch (error) {
      next(error);
    }
  };

  logout = async (req, res, next) => {
    try {
      const rawRefreshToken = req.cookies?.[COOKIE_OPTIONS.REFRESH_TOKEN] || req.body?.refreshToken;
      const userId = req.user?.userId;

      await authService.logout(rawRefreshToken, userId, this.getMeta(req));

      res.clearCookie(COOKIE_OPTIONS.REFRESH_TOKEN, {
        path: REFRESH_COOKIE_CONFIG.path,
        httpOnly: true,
      });

      ResponseUtil.sendSuccess(res, null, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  };

  forgotPassword = async (req, res, next) => {
    try {
      await authService.forgotPassword(req.body.email, this.getMeta(req));
      ResponseUtil.sendSuccess(
        res,
        null,
        'If an account with this email exists, a password reset link has been sent.'
      );
    } catch (error) {
      next(error);
    }
  };

  resetPassword = async (req, res, next) => {
    try {
      await authService.resetPassword(req.body.token, req.body.password, this.getMeta(req));
      ResponseUtil.sendSuccess(res, null, 'Password reset successful. You can now log in.');
    } catch (error) {
      next(error);
    }
  };

  verifyEmail = async (req, res, next) => {
    try {
      await authService.verifyEmail(req.body.token, this.getMeta(req));
      ResponseUtil.sendSuccess(res, null, 'Email verified successfully.');
    } catch (error) {
      next(error);
    }
  };

  resendVerification = async (req, res, next) => {
    try {
      await authService.resendVerification(req.body.email, this.getMeta(req));
      ResponseUtil.sendSuccess(res, null, 'If the account exists and is unverified, a verification email was sent.');
    } catch (error) {
      next(error);
    }
  };
}

export const authController = new AuthController();
