// src/routes/organization.routes.js
import { Router } from 'express';
import * as orgController from '../controllers/organization.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { resolveOrganization, requireOrgPermission } from '../middleware/organization.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { invitationLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  addMemberSchema,
  updateMemberRoleSchema,
  inviteMemberSchema,
} from '../validators/organization.validator.js';
import { SYSTEM_PERMISSIONS } from '../config/constants.js';

const router = Router();

// Organization CRUD
router.post(
  '/',
  requireAuth,
  validate(createOrganizationSchema),
  orgController.createOrganization
);

router.get('/', requireAuth, orgController.listOrganizations);

router.get(
  '/:id',
  requireAuth,
  resolveOrganization,
  orgController.getOrganizationById
);

router.patch(
  '/:id',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.ORGANIZATIONS_UPDATE),
  validate(updateOrganizationSchema),
  orgController.updateOrganization
);

router.delete(
  '/:id',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.ORGANIZATIONS_DELETE),
  orgController.deleteOrganization
);

// Organization Members
router.get(
  '/:id/members',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.ORGANIZATIONS_READ),
  orgController.listMembers
);

router.post(
  '/:id/members',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.ORGANIZATIONS_MANAGE_MEMBERS),
  validate(addMemberSchema),
  orgController.addMember
);

router.patch(
  '/:id/members/:userId',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.ORGANIZATIONS_MANAGE_MEMBERS),
  validate(updateMemberRoleSchema),
  orgController.updateMemberRole
);

router.delete(
  '/:id/members/:userId',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.ORGANIZATIONS_MANAGE_MEMBERS),
  orgController.removeMember
);

// Organization Invitations
router.get(
  '/:id/invitations',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.ORGANIZATIONS_INVITE),
  orgController.listInvitations
);

router.post(
  '/:id/invitations',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.ORGANIZATIONS_INVITE),
  invitationLimiter,
  validate(inviteMemberSchema),
  orgController.createInvitation
);

router.delete(
  '/:id/invitations/:invitationId',
  requireAuth,
  resolveOrganization,
  requireOrgPermission(SYSTEM_PERMISSIONS.ORGANIZATIONS_INVITE),
  orgController.revokeInvitation
);

export default router;
