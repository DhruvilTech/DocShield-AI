// src/routes/role.routes.js
import { Router } from 'express';
import { roleController } from '../controllers/role.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { assignRolesSchema, updateRolePermissionsSchema } from '../validators/role.validator.js';
import { SYSTEM_PERMISSIONS } from '../config/constants.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  requirePermission(SYSTEM_PERMISSIONS.ROLES_READ),
  roleController.listRoles
);

router.get(
  '/permissions',
  requireAuth,
  requirePermission(SYSTEM_PERMISSIONS.PERMISSIONS_READ),
  roleController.listPermissions
);

router.patch(
  '/users/:id/roles',
  requireAuth,
  requirePermission(SYSTEM_PERMISSIONS.ROLES_ASSIGN),
  validateBody(assignRolesSchema),
  roleController.assignUserRoles
);

router.patch(
  '/:id/permissions',
  requireAuth,
  requirePermission(SYSTEM_PERMISSIONS.ROLES_READ),
  validateBody(updateRolePermissionsSchema),
  roleController.updateRolePermissions
);

export default router;
