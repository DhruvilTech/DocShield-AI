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

    const membership = await membershipRepository.findMember(org.id, req.user.userId);

    if (!membership) {
      return next(
        AppError.forbidden(
          'You are not a registered member of this organization',
          'NOT_ORGANIZATION_MEMBER',
          { organizationId: org.id }
        )
      );
    }

    req.organization = org;
    req.orgMembership = membership;

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
    next();
  };
};

export const requireOrgRole = (...requiredRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.organization) {
      return next(AppError.unauthorized('Authentication and Organization context required', 'AUTH_REQUIRED'));
    }
    next();
  };
};
