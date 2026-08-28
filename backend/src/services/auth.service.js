// src/services/auth.service.js
import { v4 as uuidv4 } from 'uuid';
import { userRepository } from '../repositories/user.repository.js';
import { roleRepository } from '../repositories/role.repository.js';
import { tokenRepository } from '../repositories/token.repository.js';
import { auditService } from './audit.service.js';
import { emailService } from './email.service.js';
import { CryptoUtil } from '../utils/crypto.js';
import { JwtUtil } from '../utils/jwt.js';
import { AppError } from '../errors/AppError.js';
import { env } from '../config/env.js';
import { SYSTEM_ROLES, AUDIT_ACTIONS } from '../config/constants.js';

export class AuthService {
  async getSanitizedUser(user) {
    const roles = await roleRepository.getUserRoleSlugs(user.id);
    const permissions = await roleRepository.getUserPermissions(user.id);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatar_url,
      status: user.status,
      emailVerified: Boolean(user.email_verified),
      lastLoginAt: user.last_login_at ? new Date(user.last_login_at).toISOString() : null,
      createdAt: new Date(user.created_at).toISOString(),
      updatedAt: new Date(user.updated_at).toISOString(),
      roles,
      permissions,
    };
  }

  async issueTokens(user, familyId = null, meta = null) {
    const activeFamilyId = familyId || uuidv4();
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
    };

    const accessToken = JwtUtil.generateAccessToken(tokenPayload);
    const refreshToken = JwtUtil.generateRefreshToken({ userId: user.id, familyId: activeFamilyId });

    const refreshTokenId = uuidv4();
    const refreshTokenHash = CryptoUtil.hashToken(refreshToken);
    const expiresSeconds = JwtUtil.durationToSeconds(env.JWT_REFRESH_EXPIRATION);
    const expiresAt = new Date(Date.now() + expiresSeconds * 1000);

    await tokenRepository.createRefreshToken({
      id: refreshTokenId,
      userId: user.id,
      tokenHash: refreshTokenHash,
      familyId: activeFamilyId,
      deviceInfo: meta?.userAgent?.substring(0, 250),
      ipAddress: meta?.ipAddress?.substring(0, 45),
      expiresAt,
    });

    const accessExpiresSeconds = JwtUtil.durationToSeconds(env.JWT_ACCESS_EXPIRATION);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresSeconds,
    };
  }

  async register(data, meta = null) {
    const existing = await userRepository.findByEmail(data.email);
    if (existing) {
      throw AppError.conflict('An account with this email address already exists', 'AUTH_EMAIL_EXISTS');
    }

    const passwordHash = await CryptoUtil.hashPassword(data.password);
    const user = await userRepository.create({
      name: data.name,
      email: data.email,
      passwordHash,
      status: 'ACTIVE',
      emailVerified: false,
    });

    const targetRoleSlug = data.role || SYSTEM_ROLES.SCREENING_OFFICER;
    const role = await roleRepository.findBySlug(targetRoleSlug);
    if (role) {
      await roleRepository.assignRoleToUser(user.id, role.id);
    } else {
      const defaultRole = await roleRepository.findBySlug(SYSTEM_ROLES.SCREENING_OFFICER);
      if (defaultRole) {
        await roleRepository.assignRoleToUser(user.id, defaultRole.id);
      }
    }

    const rawVerificationToken = CryptoUtil.generateRandomToken(32);
    const tokenHash = CryptoUtil.hashToken(rawVerificationToken);
    const verificationExpiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_EXPIRATION_HOURS * 3600 * 1000);

    await tokenRepository.createEmailVerificationToken({
      id: uuidv4(),
      userId: user.id,
      tokenHash,
      expiresAt: verificationExpiresAt,
    });

    emailService.sendVerificationEmail(user.email, rawVerificationToken).catch(() => {});

    const sanitizedUser = await this.getSanitizedUser(user);
    const tokens = await this.issueTokens(sanitizedUser, null, meta);

    await auditService.log({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.REGISTER,
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      metadata: { email: user.email, assignedRole: targetRoleSlug },
    });

    return { user: sanitizedUser, tokens };
  }

  async login(credentials, meta = null) {
    const user = await userRepository.findByEmail(credentials.email);

    if (!user) {
      await auditService.log({
        actorUserId: null,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        resourceType: 'auth',
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        metadata: { email: credentials.email, reason: 'USER_NOT_FOUND' },
      });
      throw AppError.unauthorized('Invalid email or password', 'AUTH_INVALID_CREDENTIALS');
    }

    const isValidPassword = await CryptoUtil.comparePassword(credentials.password, user.password_hash);
    if (!isValidPassword) {
      await auditService.log({
        actorUserId: user.id,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        resourceType: 'auth',
        resourceId: user.id,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        metadata: { email: credentials.email, reason: 'INVALID_PASSWORD' },
      });
      throw AppError.unauthorized('Invalid email or password', 'AUTH_INVALID_CREDENTIALS');
    }

    if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      throw AppError.forbidden('Your account has been deactivated or suspended. Please contact administrator.', 'AUTH_ACCOUNT_DISABLED');
    }

    await userRepository.updateLastLogin(user.id);

    const sanitizedUser = await this.getSanitizedUser(user);
    const tokens = await this.issueTokens(sanitizedUser, null, meta);

    await auditService.log({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.LOGIN,
      resourceType: 'auth',
      resourceId: user.id,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      metadata: { email: user.email },
    });

    return { user: sanitizedUser, tokens };
  }

  async refreshToken(rawRefreshToken, meta = null) {
    const payload = JwtUtil.verifyRefreshToken(rawRefreshToken);
    const tokenHash = CryptoUtil.hashToken(rawRefreshToken);

    const tokenRecord = await tokenRepository.findRefreshTokenByHash(tokenHash);

    if (!tokenRecord) {
      throw AppError.unauthorized('Invalid refresh token session', 'AUTH_INVALID_TOKEN');
    }

    if (tokenRecord.revoked_at !== null) {
      await tokenRepository.revokeFamilyTokens(tokenRecord.family_id);
      await auditService.log({
        actorUserId: tokenRecord.user_id,
        action: 'SECURITY_ALERT_TOKEN_REUSE',
        resourceType: 'auth',
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        metadata: { familyId: tokenRecord.family_id },
      });
      throw AppError.unauthorized('Session compromised. Please log in again.', 'AUTH_SESSION_REVOKED');
    }

    await tokenRepository.revokeRefreshToken(tokenRecord.id);

    const user = await userRepository.findById(tokenRecord.user_id);
    if (!user || user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      throw AppError.unauthorized('User account is inactive or not found', 'AUTH_ACCOUNT_DISABLED');
    }

    const sanitizedUser = await this.getSanitizedUser(user);
    const tokens = await this.issueTokens(sanitizedUser, tokenRecord.family_id, meta);

    await auditService.log({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.TOKEN_REFRESH,
      resourceType: 'auth',
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return tokens;
  }

  async logout(rawRefreshToken = null, userId = null, meta = null) {
    if (rawRefreshToken) {
      try {
        const tokenHash = CryptoUtil.hashToken(rawRefreshToken);
        const record = await tokenRepository.findRefreshTokenByHash(tokenHash);
        if (record) {
          await tokenRepository.revokeRefreshToken(record.id);
        }
      } catch (err) {
        // Ignore decode issues
      }
    }

    if (userId) {
      await auditService.log({
        actorUserId: userId,
        action: AUDIT_ACTIONS.LOGOUT,
        resourceType: 'auth',
        resourceId: userId,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      });
    }
  }

  async forgotPassword(email, meta = null) {
    const user = await userRepository.findByEmail(email);

    if (user && user.status === 'ACTIVE') {
      const rawToken = CryptoUtil.generateRandomToken(32);
      const tokenHash = CryptoUtil.hashToken(rawToken);
      const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_EXPIRATION_HOURS * 3600 * 1000);

      await tokenRepository.createPasswordResetToken({
        id: uuidv4(),
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      emailService.sendPasswordResetEmail(user.email, rawToken).catch(() => {});

      await auditService.log({
        actorUserId: user.id,
        action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
        resourceType: 'auth',
        resourceId: user.id,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      });
    }
  }

  async resetPassword(token, newPassword, meta = null) {
    const tokenHash = CryptoUtil.hashToken(token);
    const record = await tokenRepository.findPasswordResetToken(tokenHash);

    if (!record || record.used_at !== null || new Date(record.expires_at) < new Date()) {
      throw AppError.badRequest('Password reset token is invalid or has expired', 'AUTH_INVALID_RESET_TOKEN');
    }

    const passwordHash = await CryptoUtil.hashPassword(newPassword);
    await userRepository.updatePassword(record.user_id, passwordHash);
    await tokenRepository.markPasswordResetUsed(record.id);

    await tokenRepository.revokeAllUserTokens(record.user_id);

    await auditService.log({
      actorUserId: record.user_id,
      action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
      resourceType: 'auth',
      resourceId: record.user_id,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
  }

  async verifyEmail(token, meta = null) {
    const tokenHash = CryptoUtil.hashToken(token);
    const record = await tokenRepository.findEmailVerificationToken(tokenHash);

    if (!record || record.used_at !== null || new Date(record.expires_at) < new Date()) {
      throw AppError.badRequest('Email verification token is invalid or has expired', 'AUTH_INVALID_VERIFY_TOKEN');
    }

    await userRepository.update(record.user_id, { emailVerified: true });
    await tokenRepository.markEmailVerificationUsed(record.id);

    await auditService.log({
      actorUserId: record.user_id,
      action: AUDIT_ACTIONS.EMAIL_VERIFIED,
      resourceType: 'user',
      resourceId: record.user_id,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
  }

  async resendVerification(email, meta = null) {
    const user = await userRepository.findByEmail(email);
    if (!user || user.email_verified) return;

    const rawToken = CryptoUtil.generateRandomToken(32);
    const tokenHash = CryptoUtil.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_EXPIRATION_HOURS * 3600 * 1000);

    await tokenRepository.createEmailVerificationToken({
      id: uuidv4(),
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    emailService.sendVerificationEmail(user.email, rawToken).catch(() => {});

    await auditService.log({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.EMAIL_VERIFICATION_SENT,
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
  }
}

export const authService = new AuthService();
