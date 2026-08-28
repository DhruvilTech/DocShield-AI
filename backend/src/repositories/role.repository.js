// src/repositories/role.repository.ts -> src/repositories/role.repository.js
import { db } from '../database/db.js';

export class RoleRepository {
  async findById(id) {
    const sql = 'SELECT id, name, slug, description, is_system, created_at, updated_at FROM roles WHERE id = ?;';
    return db.queryOne(sql, [id]);
  }

  async findBySlug(slug) {
    const sql = 'SELECT id, name, slug, description, is_system, created_at, updated_at FROM roles WHERE slug = ?;';
    return db.queryOne(sql, [slug]);
  }

  async listAll() {
    const rolesSql = 'SELECT id, name, slug, description, is_system, created_at, updated_at FROM roles ORDER BY name ASC;';
    const roles = await db.query(rolesSql);

    const result = [];
    for (const role of roles) {
      const permissions = await this.getRolePermissions(role.id);
      result.push({
        ...role,
        permissions,
      });
    }
    return result;
  }

  async getUserRoles(userId) {
    const sql = `
      SELECT r.id, r.name, r.slug, r.description, r.is_system, r.created_at, r.updated_at
      FROM roles r
      INNER JOIN user_roles ur ON r.id = ur.role_id
      WHERE ur.user_id = ?;
    `;
    return db.query(sql, [userId]);
  }

  async getUserRoleSlugs(userId) {
    const roles = await this.getUserRoles(userId);
    return roles.map((r) => r.slug);
  }

  async getUserPermissions(userId) {
    const sql = `
      SELECT DISTINCT p.slug
      FROM permissions p
      INNER JOIN role_permissions rp ON p.id = rp.permission_id
      INNER JOIN user_roles ur ON rp.role_id = ur.role_id
      WHERE ur.user_id = ?;
    `;
    const rows = await db.query(sql, [userId]);
    return rows.map((r) => r.slug);
  }

  async getRolePermissions(roleId) {
    const sql = `
      SELECT p.id, p.slug, p.resource, p.action, p.description, p.created_at, p.updated_at
      FROM permissions p
      INNER JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
      ORDER BY p.resource, p.action;
    `;
    return db.query(sql, [roleId]);
  }

  async assignRoleToUser(userId, roleId) {
    const sql = 'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?);';
    await db.execute(sql, [userId, roleId]);
  }

  async removeRoleFromUser(userId, roleId) {
    const sql = 'DELETE FROM user_roles WHERE user_id = ? AND role_id = ?;';
    await db.execute(sql, [userId, roleId]);
  }

  async syncUserRoles(userId, roleIds) {
    await db.transaction(async (conn) => {
      await conn.execute('DELETE FROM user_roles WHERE user_id = ?;', [userId]);
      for (const roleId of roleIds) {
        await conn.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?);', [userId, roleId]);
      }
    });
  }

  async updateRolePermissions(roleId, permissionIds) {
    await db.transaction(async (conn) => {
      await conn.execute('DELETE FROM role_permissions WHERE role_id = ?;', [roleId]);
      for (const permissionId of permissionIds) {
        await conn.execute('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?);', [roleId, permissionId]);
      }
    });
  }
}

export const roleRepository = new RoleRepository();
