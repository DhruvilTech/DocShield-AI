// src/repositories/watchlist.repository.js
import { db } from '../database/db.js';

export class WatchlistRepository {
  /**
   * Search watchlist entries by document number
   */
  async findByDocumentNumber(documentNumber, organizationId = null) {
    if (!documentNumber) return [];

    const cleanNum = String(documentNumber).trim().toUpperCase();
    const query = `
      SELECT * FROM watchlists
      WHERE document_number = ?
        AND is_active = TRUE
        AND (organization_id IS NULL OR organization_id = ?)
    `;
    return db.query(query, [cleanNum, organizationId]);
  }

  /**
   * Search watchlist entries by person full name
   */
  async findByName(fullName, organizationId = null) {
    if (!fullName) return [];

    const cleanName = String(fullName).trim();
    const query = `
      SELECT * FROM watchlists
      WHERE full_name LIKE ?
        AND is_active = TRUE
        AND (organization_id IS NULL OR organization_id = ?)
    `;
    return db.query(query, [`%${cleanName}%`, organizationId]);
  }

  /**
   * List watchlist items with optional search and pagination
   */
  async list({ organizationId = null, search = '', limit = 50, offset = 0 }) {
    let whereClause = 'WHERE is_active = TRUE';
    const params = [];

    if (organizationId) {
      whereClause += ' AND (organization_id IS NULL OR organization_id = ?)';
      params.push(organizationId);
    }

    if (search) {
      whereClause += ' AND (document_number LIKE ? OR full_name LIKE ? OR reason LIKE ?)';
      const searchWild = `%${search}%`;
      params.push(searchWild, searchWild, searchWild);
    }

    const countQuery = `SELECT COUNT(*) as total FROM watchlists ${whereClause}`;
    const [countResult] = await db.query(countQuery, params);
    const total = countResult ? countResult.total : 0;

    const dataQuery = `
      SELECT * FROM watchlists
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await db.query(dataQuery, [...params, Number(limit), Number(offset)]);

    return {
      data: rows,
      total,
      limit: Number(limit),
      offset: Number(offset),
    };
  }

  /**
   * Create a new watchlist record
   */
  async create(data) {
    const query = `
      INSERT INTO watchlists (
        id, organization_id, document_number, full_name, nationality,
        reason, risk_level, listed_by, is_active, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.query(query, [
      data.id,
      data.organizationId || null,
      String(data.documentNumber).trim().toUpperCase(),
      data.fullName ? String(data.fullName).trim() : null,
      data.nationality ? String(data.nationality).trim().toUpperCase() : null,
      data.reason,
      data.riskLevel || 'CRITICAL',
      data.listedBy || 'BORDER_AUTHORITY',
      data.isActive !== undefined ? data.isActive : true,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ]);

    const [created] = await db.query('SELECT * FROM watchlists WHERE id = ?', [data.id]);
    return created;
  }

  /**
   * Soft delete / deactivate a watchlist record
   */
  async deactivate(id, organizationId = null) {
    let query = 'UPDATE watchlists SET is_active = FALSE WHERE id = ?';
    const params = [id];

    if (organizationId) {
      query += ' AND (organization_id IS NULL OR organization_id = ?)';
      params.push(organizationId);
    }

    const result = await db.query(query, params);
    return result.affectedRows > 0;
  }

  /**
   * Find by ID
   */
  async findById(id, organizationId = null) {
    let query = 'SELECT * FROM watchlists WHERE id = ?';
    const params = [id];

    if (organizationId) {
      query += ' AND (organization_id IS NULL OR organization_id = ?)';
      params.push(organizationId);
    }

    const [row] = await db.query(query, params);
    return row || null;
  }
}

export const watchlistRepository = new WatchlistRepository();
