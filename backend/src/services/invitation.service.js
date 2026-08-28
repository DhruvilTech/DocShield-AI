// src/services/invitation.service.js
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/db.js';
import { invitationRepository } from '../repositories/invitation.repository.js';
import { organizationRepository } from '../repositories/organization.repository.js';
import { membershipRepository } from '../repositories/membership.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { roleRepository } from '../repositories/role.repository.js';
import { auditService } from './audit.service.js';
import { CryptoUtil } from '../utils/crypto.js';
import { AppError } from '../errors/AppError.js';
import { AUDIT_ACTIONS } from '../config/constants.js';

export class InvitationService {
  async createInvitation(organizationId, email, roleId, actorUserId, reqMeta = {}) {
    const org = await organizationRepository.findById(organizationId);
    if (!org) {
      throw AppError.notFound('Organization not found', 'ORGANIZATION_NOT_FOUND');
    }

    const role = await roleRepository.findById(roleId);
    if (!role) {
      throw AppError.notFound('Role not found', 'ROLE_NOT_FOUND');
    }

    // Check if user already exists and is already a member
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      const existingMember = await membershipRepository.findMember(organizationId, existingUser.id);
      if (existingMember) {
        throw AppError.conflict('User is already a member of this organization', 'MEMBER_EXISTS');
      }
    }

    // Check if active pending invitation already exists
    const existingInvite = await invitationRepository.findPendingByEmail(organizationId, email);
    if (existingInvite) {
      throw AppError.conflict('An active invitation is already pending for this email address', 'INVITATION_PENDING');
    }

    const rawToken = CryptoUtil.generateRandomToken();
    const tokenHash = CryptoUtil.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const invitationId = uuidv4();

    const invitation = await invitationRepository.create({
      id: invitationId,
      organizationId,
      email: email.toLowerCase().trim(),
      roleId,
      tokenHash,
      invitedBy: actorUserId,
      expiresAt,
    });

    await auditService.log({
      actorUserId,
      action: AUDIT_ACTIONS.INVITATION_CREATED,
      resourceType: 'organization_invitation',
      resourceId: invitationId,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      metadata: { organizationId, invitedEmail: email, roleId, roleSlug: role.slug },
    });

    return {
      invitation,
      rawToken,
      invitationLink: `http://localhost:5173/invitations/accept?token=${rawToken}`,
    };
  }

  async getInvitationByToken(rawToken) {
    const tokenHash = CryptoUtil.hashToken(rawToken);
    const invite = await invitationRepository.findByTokenHash(tokenHash);

    if (!invite) {
      throw AppError.notFound('Invitation not found or token is invalid', 'INVITATION_NOT_FOUND');
    }

    if (invite.revoked_at) {
      throw AppError.badRequest('This invitation has been revoked by the organization administrator', 'INVITATION_REVOKED');
    }

    if (invite.accepted_at) {
      throw AppError.badRequest('This invitation has already been accepted', 'INVITATION_ALREADY_ACCEPTED');
    }

    if (new Date(invite.expires_at) < new Date()) {
      throw AppError.badRequest('This invitation link has expired', 'INVITATION_EXPIRED');
    }

    return invite;
  }

  async acceptInvitation(rawToken, userId, reqMeta = {}) {
    const invite = await this.getInvitationByToken(rawToken);

    // Verify user exists
    const user = await userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }

    // Check if user is already a member
    const existingMember = await membershipRepository.findMember(invite.organization_id, userId);
    if (existingMember) {
      await invitationRepository.markAccepted(invite.id);
      return existingMember;
    }

    return db.transaction(async (conn) => {
      const membershipId = uuidv4();

      // 1. Add Member
      const member = await membershipRepository.addMember(
        {
          id: membershipId,
          organizationId: invite.organization_id,
          userId,
          roleId: invite.role_id,
          status: 'ACTIVE',
        },
        conn
      );

      // 2. Mark Invitation Accepted
      await invitationRepository.markAccepted(invite.id, conn);

      // 3. Log Audit
      await auditService.log(
        {
          actorUserId: userId,
          action: AUDIT_ACTIONS.INVITATION_ACCEPTED,
          resourceType: 'organization_invitation',
          resourceId: invite.id,
          ipAddress: reqMeta.ip,
          userAgent: reqMeta.userAgent,
          metadata: {
            organizationId: invite.organization_id,
            userId,
            email: invite.email,
            roleId: invite.role_id,
          },
        },
        conn
      );

      return member;
    });
  }

  async listInvitations(organizationId) {
    return invitationRepository.listByOrganization(organizationId);
  }

  async revokeInvitation(organizationId, invitationId, actorUserId, reqMeta = {}) {
    const invite = await invitationRepository.findById(invitationId);
    if (!invite || invite.organization_id !== organizationId) {
      throw AppError.notFound('Invitation not found', 'INVITATION_NOT_FOUND');
    }

    await invitationRepository.markRevoked(invitationId);

    await auditService.log({
      actorUserId,
      action: AUDIT_ACTIONS.INVITATION_REVOKED,
      resourceType: 'organization_invitation',
      resourceId: invitationId,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      metadata: { organizationId, invitationId, email: invite.email },
    });
  }
}

export const invitationService = new InvitationService();
