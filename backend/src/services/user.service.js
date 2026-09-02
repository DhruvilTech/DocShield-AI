// src/services/user.service.js
import { userRepository } from '../repositories/user.repository.js';
import { auditService } from './audit.service.js';
import { CryptoUtil } from '../utils/crypto.js';
import { AppError } from '../errors/AppError.js';
import { AUDIT_ACTIONS } from '../config/constants.js';

export class UserService {
  formatUser(user) {
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
      roles: [],
      permissions: [],
    };
  }

  async getProfile(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }
    return this.formatUser(user);
  }

  async updateProfile(userId, data) {
    const updated = await userRepository.update(userId, data);
    if (!updated) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }

    await auditService.log({
      actorUserId: userId,
      action: AUDIT_ACTIONS.USER_UPDATED,
      resourceType: 'user',
      resourceId: userId,
      metadata: { fields: Object.keys(data) },
    });

    return this.formatUser(updated);
  }

  async updatePassword(userId, currentPass, newPass) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }

    const isValid = await CryptoUtil.comparePassword(currentPass, user.password_hash);
    if (!isValid) {
      throw AppError.badRequest('Current password is incorrect', 'AUTH_INVALID_CURRENT_PASSWORD');
    }

    const newHash = await CryptoUtil.hashPassword(newPass);
    await userRepository.updatePassword(userId, newHash);

    await auditService.log({
      actorUserId: userId,
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      resourceType: 'user',
      resourceId: userId,
    });
  }

  async listUsers(page = 1, limit = 10, search = null) {
    const { users, total } = await userRepository.list(page, limit, search);
    const sanitizedUsers = users.map((u) => this.formatUser(u));
    return { users: sanitizedUsers, total };
  }

  async getUserById(id) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }
    return this.formatUser(user);
  }

  async createUserByAdmin(data, adminUserId) {
    const existing = await userRepository.findByEmail(data.email);
    if (existing) {
      throw AppError.conflict('User with this email already exists', 'AUTH_EMAIL_EXISTS');
    }

    const passwordHash = await CryptoUtil.hashPassword(data.password);
    const user = await userRepository.create({
      name: data.name,
      email: data.email,
      passwordHash,
      status: data.status || 'ACTIVE',
      emailVerified: data.emailVerified ?? true,
    });

    await auditService.log({
      actorUserId: adminUserId,
      action: AUDIT_ACTIONS.USER_CREATED,
      resourceType: 'user',
      resourceId: user.id,
      metadata: { email: user.email },
    });

    return this.formatUser(user);
  }

  async updateUserByAdmin(id, data, adminUserId) {
    const user = await userRepository.update(id, data);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }

    await auditService.log({
      actorUserId: adminUserId,
      action: AUDIT_ACTIONS.USER_UPDATED,
      resourceType: 'user',
      resourceId: id,
      metadata: data,
    });

    return this.formatUser(user);
  }

  async deleteUserByAdmin(id, adminUserId) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }

    await userRepository.delete(id);

    await auditService.log({
      actorUserId: adminUserId,
      action: AUDIT_ACTIONS.USER_DELETED,
      resourceType: 'user',
      resourceId: id,
      metadata: { email: user.email },
    });
  }
}

export const userService = new UserService();
