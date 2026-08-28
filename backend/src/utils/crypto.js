// src/utils/crypto.js
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

export class CryptoUtil {
  static async hashPassword(password) {
    const salt = await bcrypt.genSalt(env.BCRYPT_SALT_ROUNDS);
    return bcrypt.hash(password, salt);
  }

  static async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  static hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  static generateRandomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
  }
}
