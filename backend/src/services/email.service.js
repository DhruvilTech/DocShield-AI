// src/services/email.service.js
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export class EmailService {
  async sendVerificationEmail(email, token) {
    const verificationUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;
    logger.info(`[EMAIL SERVICE] Sending Email Verification to ${email}`);
    logger.info(`[EMAIL SERVICE] Verification URL: ${verificationUrl}`);
  }

  async sendPasswordResetEmail(email, token) {
    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;
    logger.info(`[EMAIL SERVICE] Sending Password Reset to ${email}`);
    logger.info(`[EMAIL SERVICE] Reset URL: ${resetUrl}`);
  }
}

export const emailService = new EmailService();
