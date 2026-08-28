// src/repositories/token.repository.js
import { db } from '../database/db.js';

export class TokenRepository {
  // === Refresh Tokens ===

  async createRefreshToken(data) {
    const sql = `
      INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, device_info, ip_address, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `;
    await db.execute(sql, [
      data.id,
      data.userId,
      data.tokenHash,
      data.familyId,
      data.deviceInfo || null,
      data.ipAddress || null,
      data.expiresAt,
    ]);
  }

  async findRefreshTokenByHash(tokenHash) {
    const sql = `
      SELECT id, user_id, token_hash, family_id, device_info, ip_address, expires_at, revoked_at, created_at
      FROM refresh_tokens
      WHERE token_hash = ?;
    `;
    return db.queryOne(sql, [tokenHash]);
  }

  async revokeRefreshToken(id) {
    const sql = 'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?;';
    await db.execute(sql, [id]);
  }

  async revokeFamilyTokens(familyId) {
    const sql = 'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE family_id = ? AND revoked_at IS NULL;';
    await db.execute(sql, [familyId]);
  }

  async revokeAllUserTokens(userId) {
    const sql = 'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL;';
    await db.execute(sql, [userId]);
  }

  // === Password Reset Tokens ===

  async createPasswordResetToken(data) {
    await db.execute('UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL;', [data.userId]);

    const sql = `
      INSERT INTO password_resets (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?);
    `;
    await db.execute(sql, [data.id, data.userId, data.tokenHash, data.expiresAt]);
  }

  async findPasswordResetToken(tokenHash) {
    const sql = `
      SELECT id, user_id, token_hash, expires_at, used_at, created_at
      FROM password_resets
      WHERE token_hash = ?;
    `;
    return db.queryOne(sql, [tokenHash]);
  }

  async markPasswordResetUsed(id) {
    const sql = 'UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ?;';
    await db.execute(sql, [id]);
  }

  // === Email Verification Tokens ===

  async createEmailVerificationToken(data) {
    await db.execute('UPDATE email_verifications SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL;', [data.userId]);

    const sql = `
      INSERT INTO email_verifications (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?);
    `;
    await db.execute(sql, [data.id, data.userId, data.tokenHash, data.expiresAt]);
  }

  async findEmailVerificationToken(tokenHash) {
    const sql = `
      SELECT id, user_id, token_hash, expires_at, used_at, created_at
      FROM email_verifications
      WHERE token_hash = ?;
    `;
    return db.queryOne(sql, [tokenHash]);
  }

  async markEmailVerificationUsed(id) {
    const sql = 'UPDATE email_verifications SET used_at = CURRENT_TIMESTAMP WHERE id = ?;';
    await db.execute(sql, [id]);
  }
}

export const tokenRepository = new TokenRepository();
