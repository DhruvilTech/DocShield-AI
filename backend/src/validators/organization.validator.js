// src/validators/organization.validator.js
import { z } from 'zod';
import { ORGANIZATION_STATUSES } from '../config/constants.js';

export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(150),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase alphanumeric characters and hyphens')
    .optional(),
  description: z.string().max(1000).optional().nullable(),
  logoUrl: z.string().url('Invalid logo URL').max(500).optional().nullable(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  description: z.string().max(1000).optional().nullable(),
  logoUrl: z.string().url().max(500).optional().nullable(),
  status: z.enum(Object.values(ORGANIZATION_STATUSES)).optional(),
});

export const addMemberSchema = z.object({
  userId: z.string().uuid('Invalid User ID'),
  roleId: z.string().uuid('Invalid Role ID').optional(),
  status: z.enum(Object.values(ORGANIZATION_STATUSES)).optional(),
});

export const updateMemberRoleSchema = z.object({
  roleId: z.string().uuid('Invalid Role ID').optional(),
  status: z.enum(Object.values(ORGANIZATION_STATUSES)).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  roleId: z.string().uuid('Invalid Role ID').optional(),
});
