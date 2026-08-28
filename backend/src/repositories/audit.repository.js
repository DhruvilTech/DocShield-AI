// src/repositories/audit.repository.js
import crypto from 'crypto';
import { db } from '../database/db.js';

export class AuditRepository {
  async insert(log) {
    const id = crypto.randomUUID();
    const sql = `
      INSERT INTO audit_logs (id, actor_user_id, action, resource_type, resource_id, ip_address, user_agent, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const metadataJson = log.metadata ? JSON.stringify(log.metadata) : null;

    await db.execute(sql, [
      id,
      log.actorUserId || null,
      log.action,
      log.resourceType,
      log.resourceId || null,
      log.ipAddress || null,
      log.userAgent || null,
      metadataJson,
    ]);

    return id;
  }

  async list(page = 1, limit = 20, filters = {}) {
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (filters.actorUserId) {
      conditions.push('a.actor_user_id = ?');
      params.push(filters.actorUserId);
    }
    if (filters.action) {
      conditions.push('a.action = ?');
      params.push(filters.action);
    }
    if (filters.resourceType) {
      conditions.push('a.resource_type = ?');
      params.push(filters.resourceType);
    }
    if (filters.startDate) {
      conditions.push('a.created_at >= ?');
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push('a.created_at <= ?');
      params.push(filters.endDate);
    }
    if (filters.search && filters.search.trim() !== '') {
      conditions.push('(a.action LIKE ? OR a.resource_type LIKE ? OR u.name LIKE ? OR u.email LIKE ?)');
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*) AS count
      FROM audit_logs a
      LEFT JOIN users u ON a.actor_user_id = u.id
      ${whereClause};
    `;
    const countRow = await db.queryOne(countSql, params);
    const total = countRow ? countRow.count : 0;

    const listSql = `
      SELECT a.id, a.actor_user_id, a.action, a.resource_type, a.resource_id,
             a.ip_address, a.user_agent, a.metadata, a.created_at,
             u.name AS actor_name, u.email AS actor_email
      FROM audit_logs a
      LEFT JOIN users u ON a.actor_user_id = u.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?;
    `;
    const listParams = [...params, limit, offset];
    const rows = await db.query(listSql, listParams);

    const logs = rows.map((r) => ({
      ...r,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
    }));

    return { logs, total };
  }
}

export const auditRepository = new AuditRepository();
