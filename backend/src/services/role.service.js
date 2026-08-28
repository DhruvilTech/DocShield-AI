// src/services/role.service.js
import { roleRepository } from '../repositories/role.repository.js';
import { permissionRepository } from '../repositories/permission.repository.js';
import { auditService } from './audit.service.js';
import { AppError } from '../errors/AppError.js';
import { AUDIT_ACTIONS } from '../config/constants.js';

export class RoleService {
  async listRoles() {
    return roleRepository.listAll();
  }

  async listPermissions() {
    return permissionRepository.listAll();
  }

  async assignUserRoles(userId, roleIds, adminUserId) {
    await roleRepository.syncUserRoles(userId, roleIds);

    await auditService.log({
      actorUserId: adminUserId,
      action: AUDIT_ACTIONS.ROLE_ASSIGNED,
      resourceType: 'user',
      resourceId: userId,
      metadata: { newRoleIds: roleIds },
    });
  }

  async updateRolePermissions(roleId, permissionIds, adminUserId) {
    const role = await roleRepository.findById(roleId);
    if (!role) {
      throw AppError.notFound('Role not found', 'ROLE_NOT_FOUND');
    }

    await roleRepository.updateRolePermissions(roleId, permissionIds);

    await auditService.log({
      actorUserId: adminUserId,
      action: AUDIT_ACTIONS.ROLE_PERMISSIONS_UPDATED,
      resourceType: 'role',
      resourceId: roleId,
      metadata: { permissionCount: permissionIds.length },
    });
  }
}

export const roleService = new RoleService();
