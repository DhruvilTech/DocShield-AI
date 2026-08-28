// src/routes/user.routes.js
import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import {
  updateMeSchema,
  updatePasswordSchema,
  createUserAdminSchema,
  updateUserAdminSchema,
} from '../validators/user.validator.js';
import { SYSTEM_PERMISSIONS } from '../config/constants.js';

const router = Router();

// Profile endpoints
router.get('/me', requireAuth, userController.getMe);
router.patch('/me', requireAuth, validateBody(updateMeSchema), userController.updateMe);
router.patch('/me/password', requireAuth, validateBody(updatePasswordSchema), userController.updatePassword);

// Administrative User Management endpoints
router.get(
  '/',
  requireAuth,
  requirePermission(SYSTEM_PERMISSIONS.USERS_READ),
  userController.listUsers
);

router.get(
  '/:id',
  requireAuth,
  requirePermission(SYSTEM_PERMISSIONS.USERS_READ),
  userController.getUserById
);

router.post(
  '/',
  requireAuth,
  requirePermission(SYSTEM_PERMISSIONS.USERS_CREATE),
  validateBody(createUserAdminSchema),
  userController.createUser
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission(SYSTEM_PERMISSIONS.USERS_UPDATE),
  validateBody(updateUserAdminSchema),
  userController.updateUser
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission(SYSTEM_PERMISSIONS.USERS_DELETE),
  userController.deleteUser
);

export default router;
