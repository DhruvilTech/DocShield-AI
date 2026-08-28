// src/services/organization.service.js
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/db.js';
import { organizationRepository } from '../repositories/organization.repository.js';
import { membershipRepository } from '../repositories/membership.repository.js';
import { roleRepository } from '../repositories/role.repository.js';
import { auditService } from './audit.service.js';
import { AppError } from '../errors/AppError.js';
import { AUDIT_ACTIONS, SYSTEM_ROLES } from '../config/constants.js';

export class OrganizationService {
  /**
   * Slugify utility
   */
  generateSlug(name) {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s-]+/g, '-')
      .substring(0, 100);
  }

  /**
   * Create organization with initial creator membership inside transaction
   */
  async createOrganization(userId, data, reqMeta = {}) {
    const slug = data.slug ? this.generateSlug(data.slug) : this.generateSlug(data.name);

    const existingSlug = await organizationRepository.findBySlug(slug);
    if (existingSlug) {
      throw AppError.conflict(`An organization with slug '${slug}' already exists`, 'SLUG_EXISTS');
    }

    const orgId = uuidv4();
    const membershipId = uuidv4();

    // Get admin role for creator
    const superAdminRole = await roleRepository.findBySlug(SYSTEM_ROLES.SUPER_ADMIN);
    if (!superAdminRole) {
      throw AppError.internal('Default admin role not configured', 'SYSTEM_ROLE_MISSING');
    }

    return db.transaction(async (conn) => {
      // 1. Create Organization
      await organizationRepository.create(
        {
          id: orgId,
          name: data.name,
          slug,
          description: data.description,
          logoUrl: data.logoUrl,
          createdBy: userId,
          status: 'ACTIVE',
        },
        conn
      );

      // 2. Assign creator as initial member with admin privileges
      await membershipRepository.addMember(
        {
          id: membershipId,
          organizationId: orgId,
          userId,
          roleId: superAdminRole.id,
          status: 'ACTIVE',
        },
        conn
      );

      // 3. Audit log
      await auditService.log(
        {
          actorUserId: userId,
          action: AUDIT_ACTIONS.ORGANIZATION_CREATED,
          resourceType: 'organization',
          resourceId: orgId,
          ipAddress: reqMeta.ip,
          userAgent: reqMeta.userAgent,
          metadata: { name: data.name, slug, creatorUserId: userId },
        },
        conn
      );

      return organizationRepository.findById(orgId, conn);
    });
  }

  async listUserOrganizations(userId) {
    return organizationRepository.findUserOrganizations(userId);
  }

  async listAllOrganizations(params = {}) {
    return organizationRepository.findAll(params);
  }

  async getOrganizationById(id) {
    const org = await organizationRepository.findById(id);
    if (!org) {
      throw AppError.notFound('Organization not found', 'ORGANIZATION_NOT_FOUND');
    }
    return org;
  }

  async updateOrganization(id, data, actorUserId, reqMeta = {}) {
    const org = await this.getOrganizationById(id);

    const updated = await organizationRepository.update(id, data);

    await auditService.log({
      actorUserId,
      action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,
      resourceType: 'organization',
      resourceId: id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      metadata: { previous: { name: org.name, status: org.status }, updated: data },
    });

    return updated;
  }

  async deleteOrganization(id, actorUserId, reqMeta = {}) {
    const org = await this.getOrganizationById(id);

    await organizationRepository.delete(id);

    await auditService.log({
      actorUserId,
      action: AUDIT_ACTIONS.ORGANIZATION_DELETED,
      resourceType: 'organization',
      resourceId: id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      metadata: { deletedOrgName: org.name, slug: org.slug },
    });
  }
}

export const organizationService = new OrganizationService();
