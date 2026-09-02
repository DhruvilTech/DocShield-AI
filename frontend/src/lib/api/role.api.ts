// src/lib/api/role.api.ts
import { Role, Permission } from '../../types';

export const roleApi = {
  listRoles: async () => {
    return { success: true, data: { roles: [] as Role[] } };
  },

  getRoles: async (): Promise<Role[]> => {
    return [];
  },

  listPermissions: async () => {
    return { success: true, data: { permissions: [] as Permission[] } };
  },

  getPermissions: async (): Promise<Permission[]> => {
    return [];
  },

  assignUserRoles: async (_userId: string, _roleIds: string[]) => {
    return { success: true, message: 'Roles updated' };
  },

  updateRolePermissions: async (_roleId: string, _permissionIds: string[]) => {
    return { success: true, message: 'Permissions updated' };
  },
};
