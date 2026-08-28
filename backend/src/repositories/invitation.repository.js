// src/repositories/invitation.repository.js
import { db } from '../database/db.js';

export class InvitationRepository {
  async create(invitation, connection = null) {
    const sql = `
      INSERT INTO organization_invitations (
        id, organization_id, email, role_id, token_hash, invited_by, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [
      invitation.id,
      invitation.organizationId,
      invitation.email,
      invitation.roleId,
      invitation.tokenHash,
      invitation.invitedBy,
      invitation.expiresAt,
    ];

    if (connection) {
      await connection.execute(sql, params);
    } else {
      await db.execute(sql, params);
    }

    return this.findById(invitation.id, connection);
  }

  async findById(id, connection = null) {
    const sql = `
      SELECT oi.*, o.name AS organization_name, o.slug AS organization_slug,
             r.name AS role_name, r.slug AS role_slug,
             u.name AS inviter_name, u.email AS inviter_email
      FROM organization_invitations oi
      INNER JOIN organizations o ON oi.organization_id = o.id
      INNER JOIN roles r ON oi.role_id = r.id
      INNER JOIN users u ON oi.invited_by = u.id
      WHERE oi.id = ?;
    `;
    if (connection) {
      const [rows] = await connection.execute(sql, [id]);
      return rows[0] || null;
    }
    return db.queryOne(sql, [id]);
  }

  async findByTokenHash(tokenHash, connection = null) {
    const sql = `
      SELECT oi.*, o.name AS organization_name, o.slug AS organization_slug, o.status AS organization_status,
             r.name AS role_name, r.slug AS role_slug,
             u.name AS inviter_name, u.email AS inviter_email
      FROM organization_invitations oi
      INNER JOIN organizations o ON oi.organization_id = o.id
      INNER JOIN roles r ON oi.role_id = r.id
      INNER JOIN users u ON oi.invited_by = u.id
      WHERE oi.token_hash = ?;
    `;
    if (connection) {
      const [rows] = await connection.execute(sql, [tokenHash]);
      return rows[0] || null;
    }
    return db.queryOne(sql, [tokenHash]);
  }

  async findPendingByEmail(organizationId, email) {
    const sql = `
      SELECT * FROM organization_invitations
      WHERE organization_id = ? AND email = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW();
    `;
    return db.queryOne(sql, [organizationId, email]);
  }

  async listByOrganization(organizationId) {
    const sql = `
      SELECT oi.*, r.name AS role_name, r.slug AS role_slug,
             u.name AS inviter_name, u.email AS inviter_email
      FROM organization_invitations oi
      INNER JOIN roles r ON oi.role_id = r.id
      INNER JOIN users u ON oi.invited_by = u.id
      WHERE oi.organization_id = ?
      ORDER BY oi.created_at DESC;
    `;
    return db.query(sql, [organizationId]);
  }

  async markAccepted(id, connection = null) {
    const sql = `UPDATE organization_invitations SET accepted_at = NOW() WHERE id = ?;`;
    if (connection) {
      await connection.execute(sql, [id]);
    } else {
      await db.execute(sql, [id]);
    }
  }

  async markRevoked(id, connection = null) {
    const sql = `UPDATE organization_invitations SET revoked_at = NOW() WHERE id = ?;`;
    if (connection) {
      await connection.execute(sql, [id]);
    } else {
      await db.execute(sql, [id]);
    }
  }
}

export const invitationRepository = new InvitationRepository();
