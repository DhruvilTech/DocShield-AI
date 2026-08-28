// src/middleware/organization.middleware.js
import { organizationRepository } from '../repositories/organization.repository.js';
import { membershipRepository } from '../repositories/membership.repository.js';
import { AppError } from '../errors/AppError.js';

export const resolveOrganization = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required before resolving organization', 'AUTH_REQUIRED'));
    }

    let orgId =
      req.headers['x-organization-id'] ||
      req.params.organizationId ||
      req.params.orgId ||
      req.query.organizationId;

    if (!orgId) {
      // Graceful fallback: check if user belongs to an active organization
      const userOrgs = await organizationRepository.findByUserId(req.user.userId);
      if (userOrgs && userOrgs.length > 0) {
        orgId = userOrgs[0].id;
      } else if (req.user.roles && req.user.roles.includes('super_admin')) {
        const defaultOrg = await organizationRepository.findBySlug('global-security');
        if (defaultOrg) {
          orgId = defaultOrg.id;
        }
      }
    }

    if (!orgId) {
      return next(
        AppError.badRequest(
          'Organization context missing. Please supply x-organization-id header or establish an organization.',
          'ORGANIZATION_CONTEXT_REQUIRED'
        )
      );
    }

    const org = await organizationRepository.findById(orgId);
    if (!org || org.status === 'SUSPENDED') {
      return next(AppError.notFound('Organization not found or inactive', 'ORGANIZATION_NOT_FOUND'));
    }

    const isSuperAdmin = req.user.roles && req.user.roles.includes('super_admin');

    // Check membership
    const membership = await membershipRepository.findMember(org.id, req.user.userId);

    if (!membership && !isSuperAdmin) {
      return next(
        AppError.forbidden(
          'You are not a registered member of this organization',
          'NOT_ORGANIZATION_MEMBER',
          { organizationId: org.id }
        )
      );
    }

    let orgRole = membership ? membership.role_slug : 'super_admin';
    let orgPermissions = membership
      ? await membershipRepository.getMemberPermissions(org.id, req.user.userId)
      : req.user.permissions;

    req.organization = org;
    req.orgMembership = membership;
    req.orgRole = orgRole;
    req.orgPermissions = orgPermissions;

    next();
  } catch (error) {
    next(error);
  }
};

export const requireOrgPermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user || !req.organization) {
      return next(AppError.unauthorized('Authentication and Organization context required', 'AUTH_REQUIRED'));
    }

    if (req.user.roles && req.user.roles.includes('super_admin')) {
      return next();
    }

    const userPerms = new Set(req.orgPermissions || []);
    const hasAll = requiredPermissions.every((p) => userPerms.has(p));

    if (!hasAll) {
      return next(
        AppError.forbidden(
          `Insufficient organization permissions. Required: ${requiredPermissions.join(', ')}`,
          'FORBIDDEN_PERMISSION_DENIED',
          { required: requiredPermissions, organizationId: req.organization.id }
        )
      );
    }

    next();
  };
};

export const requireOrgRole = (...requiredRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.organization) {
      return next(AppError.unauthorized('Authentication and Organization context required', 'AUTH_REQUIRED'));
    }

    if (req.user.roles && req.user.roles.includes('super_admin')) {
      return next();
    }

    const matches = requiredRoles.includes(req.orgRole);
    if (!matches) {
      return next(
        AppError.forbidden(
          `Access restricted to organization roles: ${requiredRoles.join(', ')}`,
          'FORBIDDEN_ROLE_DENIED',
          { required: requiredRoles, organizationId: req.organization.id }
        )
      );
    }

    next();
  };
};
