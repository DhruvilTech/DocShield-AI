// src/routes/user.routes.js
import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import {
  updateMeSchema,
  updatePasswordSchema,
  createUserAdminSchema,
  updateUserAdminSchema,
} from '../validators/user.validator.js';

const router = Router();

// Profile endpoints
router.get('/me', requireAuth, userController.getMe);
router.patch('/me', requireAuth, validateBody(updateMeSchema), userController.updateMe);
router.patch('/me/password', requireAuth, validateBody(updatePasswordSchema), userController.updatePassword);

// Administrative User Management endpoints
router.get('/', requireAuth, userController.listUsers);
router.get('/:id', requireAuth, userController.getUserById);
router.post('/', requireAuth, validateBody(createUserAdminSchema), userController.createUser);
router.patch('/:id', requireAuth, validateBody(updateUserAdminSchema), userController.updateUser);
router.delete('/:id', requireAuth, userController.deleteUser);

export default router;
