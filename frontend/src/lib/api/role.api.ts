// src/lib/api/role.api.ts
import { apiClient } from './client';
import { Role, Permission } from '../../types';

export const roleApi = {
  listRoles: () => {
    return apiClient<{ success: boolean; data: { roles: Role[] } }>('/roles');
  },

  listPermissions: () => {
    return apiClient<{ success: boolean; data: { permissions: Permission[] } }>('/roles/permissions');
  },

  assignUserRoles: (userId: string, roleIds: string[]) => {
    return apiClient<{ success: boolean; message: string }>(`/roles/users/${userId}/roles`, {
      method: 'PATCH',
      body: JSON.stringify({ roleIds }),
    });
  },

  updateRolePermissions: (roleId: string, permissionIds: string[]) => {
    return apiClient<{ success: boolean; message: string }>(`/roles/${roleId}/permissions`, {
      method: 'PATCH',
      body: JSON.stringify({ permissionIds }),
    });
  },
};
