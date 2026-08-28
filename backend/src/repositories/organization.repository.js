// src/repositories/organization.repository.js
import { db } from '../database/db.js';

export class OrganizationRepository {
  async create(org, connection = null) {
    const sql = `
      INSERT INTO organizations (id, name, slug, description, logo_url, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [
      org.id,
      org.name,
      org.slug,
      org.description || null,
      org.logoUrl || null,
      org.status || 'ACTIVE',
      org.createdBy,
    ];

    if (connection) {
      await connection.execute(sql, params);
    } else {
      await db.execute(sql, params);
    }

    return this.findById(org.id, connection);
  }

  async findById(id, connection = null) {
    const sql = `
      SELECT o.*, u.name AS creator_name, u.email AS creator_email
      FROM organizations o
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.id = ?;
    `;
    if (connection) {
      const [rows] = await connection.execute(sql, [id]);
      return rows[0] || null;
    }
    return db.queryOne(sql, [id]);
  }

  async findBySlug(slug, connection = null) {
    const sql = `SELECT * FROM organizations WHERE slug = ?;`;
    if (connection) {
      const [rows] = await connection.execute(sql, [slug]);
      return rows[0] || null;
    }
    return db.queryOne(sql, [slug]);
  }

  async findUserOrganizations(userId) {
    const sql = `
      SELECT o.*, om.role_id, r.name AS role_name, r.slug AS role_slug, om.status AS member_status, om.joined_at
      FROM organizations o
      INNER JOIN organization_members om ON o.id = om.organization_id
      INNER JOIN roles r ON om.role_id = r.id
      WHERE om.user_id = ? AND o.status != 'SUSPENDED' AND om.status = 'ACTIVE'
      ORDER BY o.created_at DESC;
    `;
    return db.query(sql, [userId]);
  }

  async findAll(params = {}) {
    let sql = `
      SELECT o.*, 
        (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id) AS member_count,
        (SELECT COUNT(*) FROM documents d WHERE d.organization_id = o.id AND d.status != 'DELETED') AS document_count
      FROM organizations o
    `;
    const conditions = [];
    const queryParams = [];

    if (params.search) {
      conditions.push('(o.name LIKE ? OR o.slug LIKE ?)');
      queryParams.push(`%${params.search}%`, `%${params.search}%`);
    }

    if (params.status) {
      conditions.push('o.status = ?');
      queryParams.push(params.status);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' ORDER BY o.created_at DESC';

    const page = parseInt(params.page, 10) || 1;
    const limit = parseInt(params.limit, 10) || 20;
    const offset = (page - 1) * limit;

    // Count
    const countSql = `SELECT COUNT(*) AS total FROM (${sql}) AS sub;`;
    const countRes = await db.queryOne(countSql, queryParams);
    const total = countRes ? countRes.total : 0;

    sql += ` LIMIT ? OFFSET ?;`;
    queryParams.push(limit, offset);

    const rows = await db.query(sql, queryParams);

    return {
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async update(id, data, connection = null) {
    const fields = [];
    const params = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      params.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push('description = ?');
      params.push(data.description);
    }
    if (data.logoUrl !== undefined) {
      fields.push('logo_url = ?');
      params.push(data.logoUrl);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      params.push(data.status);
    }

    if (fields.length === 0) return this.findById(id, connection);

    params.push(id);
    const sql = `UPDATE organizations SET ${fields.join(', ')} WHERE id = ?;`;

    if (connection) {
      await connection.execute(sql, params);
    } else {
      await db.execute(sql, params);
    }

    return this.findById(id, connection);
  }

  async delete(id, connection = null) {
    const sql = `DELETE FROM organizations WHERE id = ?;`;
    if (connection) {
      await connection.execute(sql, [id]);
    } else {
      await db.execute(sql, [id]);
    }
  }
}

export const organizationRepository = new OrganizationRepository();
