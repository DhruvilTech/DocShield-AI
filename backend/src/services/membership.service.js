// src/services/membership.service.js
import { v4 as uuidv4 } from 'uuid';
import { membershipRepository } from '../repositories/membership.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { roleRepository } from '../repositories/role.repository.js';
import { auditService } from './audit.service.js';
import { AppError } from '../errors/AppError.js';
import { AUDIT_ACTIONS } from '../config/constants.js';

export class MembershipService {
  async listMembers(organizationId, params = {}) {
    return membershipRepository.listMembers(organizationId, params);
  }

  async addMember(organizationId, userId, roleId, actorUserId, reqMeta = {}) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }

    const role = await roleRepository.findById(roleId);
    if (!role) {
      throw AppError.notFound('Role not found', 'ROLE_NOT_FOUND');
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
      roleId,
      status: 'ACTIVE',
    });

    await auditService.log({
      actorUserId,
      action: AUDIT_ACTIONS.MEMBER_ADDED,
      resourceType: 'organization_member',
      resourceId: membershipId,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      metadata: { organizationId, addedUserId: userId, roleId, roleSlug: role.slug },
    });

    return member;
  }

  async updateMemberRole(organizationId, targetUserId, newRoleId, status = null, actorUserId = null, reqMeta = {}) {
    const member = await membershipRepository.findMember(organizationId, targetUserId);
    if (!member) {
      throw AppError.notFound('Member not found in organization', 'MEMBER_NOT_FOUND');
    }

    const role = await roleRepository.findById(newRoleId);
    if (!role) {
      throw AppError.notFound('Role not found', 'ROLE_NOT_FOUND');
    }

    // Safety check: Do not allow demoting the only admin
    if (member.role_slug === 'super_admin' && role.slug !== 'super_admin') {
      const adminCount = await membershipRepository.countOrgAdmins(organizationId);
      if (adminCount <= 1) {
        throw AppError.badRequest('Cannot demote the only administrator of the organization', 'CANNOT_DEMOTE_LAST_ADMIN');
      }
    }

    const updated = await membershipRepository.updateMemberRole(organizationId, targetUserId, newRoleId, status);

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
        newRoleId,
        newRoleSlug: role.slug,
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
