// src/repositories/user.repository.js
import crypto from 'crypto';
import { db } from '../database/db.js';

export class UserRepository {
  async findById(id) {
    const sql = `
      SELECT id, name, email, password_hash, avatar_url, status, email_verified,
             last_login_at, created_at, updated_at
      FROM users
      WHERE id = ?;
    `;
    return db.queryOne(sql, [id]);
  }

  async findByEmail(email) {
    const sql = `
      SELECT id, name, email, password_hash, avatar_url, status, email_verified,
             last_login_at, created_at, updated_at
      FROM users
      WHERE email = ?;
    `;
    return db.queryOne(sql, [email.toLowerCase().trim()]);
  }

  async create(user) {
    const sql = `
      INSERT INTO users (id, name, email, password_hash, avatar_url, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `;
    const id = user.id || crypto.randomUUID();
    const status = user.status || 'ACTIVE';
    const emailVerified = user.emailVerified ?? false;

    await db.execute(sql, [
      id,
      user.name,
      user.email.toLowerCase().trim(),
      user.passwordHash,
      user.avatarUrl || null,
      status,
      emailVerified,
    ]);

    const created = await this.findById(id);
    if (!created) {
      throw new Error('Failed to retrieve newly created user');
    }
    return created;
  }

  async update(id, updates) {
    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.avatarUrl !== undefined) {
      fields.push('avatar_url = ?');
      values.push(updates.avatarUrl);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.emailVerified !== undefined) {
      fields.push('email_verified = ?');
      values.push(updates.emailVerified);
    }

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?;`;
    await db.execute(sql, values);

    return this.findById(id);
  }

  async updatePassword(id, passwordHash) {
    const sql = 'UPDATE users SET password_hash = ? WHERE id = ?;';
    await db.execute(sql, [passwordHash, id]);
  }

  async updateLastLogin(id) {
    const sql = 'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?;';
    await db.execute(sql, [id]);
  }

  async delete(id) {
    const sql = 'DELETE FROM users WHERE id = ?;';
    const result = await db.execute(sql, [id]);
    return result.affectedRows > 0;
  }

  async list(page = 1, limit = 10, search = null) {
    const offset = (page - 1) * limit;
    let whereClause = '';
    const params = [];

    if (search && search.trim() !== '') {
      whereClause = 'WHERE name LIKE ? OR email LIKE ?';
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    const countSql = `SELECT COUNT(*) AS count FROM users ${whereClause};`;
    const countRow = await db.queryOne(countSql, params);
    const total = countRow ? countRow.count : 0;

    const listSql = `
      SELECT id, name, email, password_hash, avatar_url, status, email_verified,
             last_login_at, created_at, updated_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?;
    `;
    const listParams = [...params, limit, offset];
    const users = await db.query(listSql, listParams);

    return { users, total };
  }
}

export const userRepository = new UserRepository();
