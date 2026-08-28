// src/validators/user.validator.js
import { z } from 'zod';
import { PASSWORD_REGEX, PASSWORD_REQUIREMENT_MSG } from '../config/constants.js';

export const updateMeSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
  avatarUrl: z.string().url('Avatar must be a valid URL').nullable().optional(),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').regex(PASSWORD_REGEX, PASSWORD_REQUIREMENT_MSG),
});

export const createUserAdminSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please provide a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').regex(PASSWORD_REGEX, PASSWORD_REQUIREMENT_MSG),
  roles: z.array(z.string()).min(1, 'At least one role must be assigned'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION']).optional(),
  emailVerified: z.boolean().optional(),
});

export const updateUserAdminSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION']).optional(),
  emailVerified: z.boolean().optional(),
  avatarUrl: z.string().url().nullable().optional(),
});
