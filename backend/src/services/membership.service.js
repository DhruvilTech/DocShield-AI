// src/services/membership.service.js
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/db.js';
import { membershipRepository } from '../repositories/membership.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { auditService } from './audit.service.js';
import { AppError } from '../errors/AppError.js';
import { AUDIT_ACTIONS } from '../config/constants.js';

export class MembershipService {
  async listMembers(organizationId, params = {}) {
    return membershipRepository.listMembers(organizationId, params);
  }

  async addMember(organizationId, userId, roleId = null, actorUserId, reqMeta = {}) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }

    let effectiveRoleId = roleId;
    if (!effectiveRoleId) {
      const defaultRoleRows = await db.query('SELECT id FROM roles LIMIT 1');
      effectiveRoleId = defaultRoleRows[0]?.id;
    }

    const existing = await membershipRepository.findMember(organizationId, userId);
    if (existing) {
      throw AppError.conflict('User is already a member of this organization', 'MEMBER_EXISTS');
    }

    const membershipId = uuidv4();
    const member = await membershipRepository.addMember({
      id: membershipId,
      organizationId,
      userId,
      roleId: effectiveRoleId,
      status: 'ACTIVE',
    });

    await auditService.log({
      actorUserId,
      action: AUDIT_ACTIONS.MEMBER_ADDED,
      resourceType: 'organization_member',
      resourceId: membershipId,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      metadata: { organizationId, addedUserId: userId },
    });

    return member;
  }

  async updateMemberRole(organizationId, targetUserId, newRoleId = null, status = null, actorUserId = null, reqMeta = {}) {
    const member = await membershipRepository.findMember(organizationId, targetUserId);
    if (!member) {
      throw AppError.notFound('Member not found in organization', 'MEMBER_NOT_FOUND');
    }

    let effectiveRoleId = newRoleId || member.role_id;
    if (!effectiveRoleId) {
      const defaultRoleRows = await db.query('SELECT id FROM roles LIMIT 1');
      effectiveRoleId = defaultRoleRows[0]?.id;
    }

    const updated = await membershipRepository.updateMemberRole(organizationId, targetUserId, effectiveRoleId, status);

    await auditService.log({
      actorUserId,
      action: AUDIT_ACTIONS.MEMBER_ROLE_UPDATED,
      resourceType: 'organization_member',
      resourceId: member.id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      metadata: {
        organizationId,
        targetUserId,
        previousRoleId: member.role_id,
        newRoleId: effectiveRoleId,
      },
    });

    return updated;
  }

  async removeMember(organizationId, targetUserId, actorUserId, reqMeta = {}) {
    const member = await membershipRepository.findMember(organizationId, targetUserId);
    if (!member) {
      throw AppError.notFound('Member not found in organization', 'MEMBER_NOT_FOUND');
    }

    // Safety check: Do not allow removing the only admin
    if (member.role_slug === 'super_admin') {
      const adminCount = await membershipRepository.countOrgAdmins(organizationId);
      if (adminCount <= 1) {
        throw AppError.badRequest('Cannot remove the only administrator of the organization', 'CANNOT_REMOVE_LAST_ADMIN');
      }
    }

    await membershipRepository.removeMember(organizationId, targetUserId);

    await auditService.log({
      actorUserId,
      action: AUDIT_ACTIONS.MEMBER_REMOVED,
      resourceType: 'organization_member',
      resourceId: member.id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      metadata: { organizationId, removedUserId: targetUserId, email: member.user_email },
    });
  }
}

export const membershipService = new MembershipService();
