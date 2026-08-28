// src/validators/role.validator.js
import { z } from 'zod';

export const assignRolesSchema = z.object({
  roleIds: z.array(z.string().uuid('Invalid role ID format')).min(1, 'At least one role ID is required'),
});

export const updateRolePermissionsSchema = z.object({
  permissionIds: z.array(z.string().uuid('Invalid permission ID format')),
});
