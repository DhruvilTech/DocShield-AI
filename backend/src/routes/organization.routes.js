// src/routes/organization.routes.js
import { Router } from 'express';
import * as orgController from '../controllers/organization.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { resolveOrganization } from '../middleware/organization.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { invitationLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  addMemberSchema,
  updateMemberRoleSchema,
  inviteMemberSchema,
} from '../validators/organization.validator.js';

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
  validate(updateOrganizationSchema),
  orgController.updateOrganization
);

router.delete(
  '/:id',
  requireAuth,
  resolveOrganization,
  orgController.deleteOrganization
);

// Organization Members
router.get(
  '/:id/members',
  requireAuth,
  resolveOrganization,
  orgController.listMembers
);

router.post(
  '/:id/members',
  requireAuth,
  resolveOrganization,
  validate(addMemberSchema),
  orgController.addMember
);

router.patch(
  '/:id/members/:userId',
  requireAuth,
  resolveOrganization,
  validate(updateMemberRoleSchema),
  orgController.updateMemberRole
);

router.delete(
  '/:id/members/:userId',
  requireAuth,
  resolveOrganization,
  orgController.removeMember
);

// Organization Invitations
router.get(
  '/:id/invitations',
  requireAuth,
  resolveOrganization,
  orgController.listInvitations
);

router.post(
  '/:id/invitations',
  requireAuth,
  resolveOrganization,
  invitationLimiter,
  validate(inviteMemberSchema),
  orgController.createInvitation
);

router.delete(
  '/:id/invitations/:invitationId',
  requireAuth,
  resolveOrganization,
  orgController.revokeInvitation
);

export default router;
