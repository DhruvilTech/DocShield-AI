// src/repositories/membership.repository.js
import { db } from '../database/db.js';

export class MembershipRepository {
  async addMember(membership, connection = null) {
    const sql = `
      INSERT INTO organization_members (id, organization_id, user_id, role_id, status)
      VALUES (?, ?, ?, ?, ?);
    `;
    const params = [
      membership.id,
      membership.organizationId,
      membership.userId,
      membership.roleId,
      membership.status || 'ACTIVE',
    ];

    if (connection) {
      await connection.execute(sql, params);
    } else {
      await db.execute(sql, params);
    }

    return this.findMember(membership.organizationId, membership.userId, connection);
  }

  async findMember(organizationId, userId, connection = null) {
    const sql = `
      SELECT om.*, u.name AS user_name, u.email AS user_email, u.avatar_url,
             r.name AS role_name, r.slug AS role_slug
      FROM organization_members om
      INNER JOIN users u ON om.user_id = u.id
      INNER JOIN roles r ON om.role_id = r.id
      WHERE om.organization_id = ? AND om.user_id = ?;
    `;
    if (connection) {
      const [rows] = await connection.execute(sql, [organizationId, userId]);
      return rows[0] || null;
    }
    return db.queryOne(sql, [organizationId, userId]);
  }

  async getMemberPermissions(organizationId, userId) {
    const sql = `
      SELECT DISTINCT p.slug
      FROM organization_members om
      INNER JOIN role_permissions rp ON om.role_id = rp.role_id
      INNER JOIN permissions p ON rp.permission_id = p.id
      WHERE om.organization_id = ? AND om.user_id = ? AND om.status = 'ACTIVE';
    `;
    const rows = await db.query(sql, [organizationId, userId]);
    return rows.map((r) => r.slug);
  }

  async listMembers(organizationId, params = {}) {
    let sql = `
      SELECT om.id AS membership_id, om.status AS membership_status, om.joined_at,
             u.id AS user_id, u.name, u.email, u.avatar_url, u.status AS user_status,
             r.id AS role_id, r.name AS role_name, r.slug AS role_slug
      FROM organization_members om
      INNER JOIN users u ON om.user_id = u.id
      INNER JOIN roles r ON om.role_id = r.id
      WHERE om.organization_id = ?
    `;
    const queryParams = [organizationId];

    if (params.search) {
      sql += ' AND (u.name LIKE ? OR u.email LIKE ?)';
      queryParams.push(`%${params.search}%`, `%${params.search}%`);
    }

    if (params.role) {
      sql += ' AND r.slug = ?';
      queryParams.push(params.role);
    }

    if (params.status) {
      sql += ' AND om.status = ?';
      queryParams.push(params.status);
    }

    sql += ' ORDER BY om.joined_at ASC;';

    return db.query(sql, queryParams);
  }

  async updateMemberRole(organizationId, userId, roleId, status = null, connection = null) {
    const fields = ['role_id = ?'];
    const params = [roleId];

    if (status !== null) {
      fields.push('status = ?');
      params.push(status);
    }

    params.push(organizationId, userId);
    const sql = `UPDATE organization_members SET ${fields.join(', ')} WHERE organization_id = ? AND user_id = ?;`;

    if (connection) {
      await connection.execute(sql, params);
    } else {
      await db.execute(sql, params);
    }

    return this.findMember(organizationId, userId, connection);
  }

  async removeMember(organizationId, userId, connection = null) {
    const sql = `DELETE FROM organization_members WHERE organization_id = ? AND user_id = ?;`;
    if (connection) {
      await connection.execute(sql, [organizationId, userId]);
    } else {
      await db.execute(sql, [organizationId, userId]);
    }
  }

  async countOrgAdmins(organizationId) {
    const sql = `
      SELECT COUNT(*) AS total
      FROM organization_members om
      INNER JOIN roles r ON om.role_id = r.id
      WHERE om.organization_id = ? AND (r.slug = 'super_admin' OR r.slug = 'org_admin') AND om.status = 'ACTIVE';
    `;
    const res = await db.queryOne(sql, [organizationId]);
    return res ? res.total : 0;
  }
}

export const membershipRepository = new MembershipRepository();
