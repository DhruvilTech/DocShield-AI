// src/validators/auth.validator.js
import { z } from 'zod';
import { PASSWORD_REGEX, PASSWORD_REQUIREMENT_MSG } from '../config/constants.js';

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please provide a valid email address').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').regex(PASSWORD_REGEX, PASSWORD_REQUIREMENT_MSG),
  role: z.enum(['screening_officer', 'investigator', 'analyst_viewer']).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').regex(PASSWORD_REGEX, PASSWORD_REQUIREMENT_MSG),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export const resendVerificationSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
});
