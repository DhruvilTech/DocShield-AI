// src/repositories/permission.repository.js
import { db } from '../database/db.js';

export class PermissionRepository {
  async findById(id) {
    const sql = 'SELECT id, slug, resource, action, description, created_at, updated_at FROM permissions WHERE id = ?;';
    return db.queryOne(sql, [id]);
  }

  async findBySlug(slug) {
    const sql = 'SELECT id, slug, resource, action, description, created_at, updated_at FROM permissions WHERE slug = ?;';
    return db.queryOne(sql, [slug]);
  }

  async listAll() {
    const sql = 'SELECT id, slug, resource, action, description, created_at, updated_at FROM permissions ORDER BY resource, action;';
    return db.query(sql);
  }
}

export const permissionRepository = new PermissionRepository();
