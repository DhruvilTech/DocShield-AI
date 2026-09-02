// src/controllers/organization.controller.js
import { organizationService } from '../services/organization.service.js';
import { membershipService } from '../services/membership.service.js';
import { invitationService } from '../services/invitation.service.js';
import { ResponseUtil } from '../utils/response.js';

export const createOrganization = async (req, res, next) => {
  try {
    const org = await organizationService.createOrganization(
      req.user.userId,
      req.body,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );
    return ResponseUtil.sendSuccess(res, { organization: org }, 201, 'Organization created successfully');
  } catch (error) {
    next(error);
  }
};

export const listOrganizations = async (req, res, next) => {
  try {
    if (req.query.all === 'true') {
      const result = await organizationService.listAllOrganizations(req.query);
      return ResponseUtil.sendPaginated(res, result.data, result.pagination);
    }

    const orgs = await organizationService.listUserOrganizations(req.user.userId);
    return ResponseUtil.sendSuccess(res, { organizations: orgs });
  } catch (error) {
    next(error);
  }
};

export const getOrganizationById = async (req, res, next) => {
  try {
    const org = await organizationService.getOrganizationById(req.params.id);
    return ResponseUtil.sendSuccess(res, { organization: org });
  } catch (error) {
    next(error);
  }
};

export const updateOrganization = async (req, res, next) => {
  try {
    const org = await organizationService.updateOrganization(
      req.params.id,
      req.body,
      req.user.userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );
    return ResponseUtil.sendSuccess(res, { organization: org }, 200, 'Organization updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deleteOrganization = async (req, res, next) => {
  try {
    await organizationService.deleteOrganization(
      req.params.id,
      req.user.userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );
    return ResponseUtil.sendSuccess(res, null, 200, 'Organization deleted successfully');
  } catch (error) {
    next(error);
  }
};

// Members
export const listMembers = async (req, res, next) => {
  try {
    const members = await membershipService.listMembers(req.params.id, req.query);
    return ResponseUtil.sendSuccess(res, { members });
  } catch (error) {
    next(error);
  }
};

export const addMember = async (req, res, next) => {
  try {
    const member = await membershipService.addMember(
      req.params.id,
      req.body.userId,
      req.body.roleId,
      req.user.userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );
    return ResponseUtil.sendSuccess(res, { member }, 201, 'Member added to organization');
  } catch (error) {
    next(error);
  }
};

export const updateMemberRole = async (req, res, next) => {
  try {
    const member = await membershipService.updateMemberRole(
      req.params.id,
      req.params.userId,
      req.body.roleId,
      req.body.status,
      req.user.userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );
    return ResponseUtil.sendSuccess(res, { member }, 200, 'Member role updated successfully');
  } catch (error) {
    next(error);
  }
};

export const removeMember = async (req, res, next) => {
  try {
    await membershipService.removeMember(
      req.params.id,
      req.params.userId,
      req.user.userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );
    return ResponseUtil.sendSuccess(res, null, 200, 'Member removed from organization');
  } catch (error) {
    next(error);
  }
};

// Invitations
export const createInvitation = async (req, res, next) => {
  try {
    const result = await invitationService.createInvitation(
      req.params.id,
      req.body.email,
      req.body.roleId,
      req.user.userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );
    return ResponseUtil.sendSuccess(
      res,
      result,
      201,
      'Invitation dispatched successfully'
    );
  } catch (error) {
    next(error);
  }
};

export const listInvitations = async (req, res, next) => {
  try {
    const invitations = await invitationService.listInvitations(req.params.id);
    return ResponseUtil.sendSuccess(res, { invitations });
  } catch (error) {
    next(error);
  }
};

export const revokeInvitation = async (req, res, next) => {
  try {
    await invitationService.revokeInvitation(
      req.params.id,
      req.params.invitationId,
      req.user.userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );
    return ResponseUtil.sendSuccess(res, null, 200, 'Invitation revoked successfully');
  } catch (error) {
    next(error);
  }
};
