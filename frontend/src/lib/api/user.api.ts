// src/lib/api/user.api.ts
import { apiClient } from './client';
import { User, UserStatus } from '../../types';

export const userApi = {
  getMe: () => {
    return apiClient<{ success: boolean; data: { user: User } }>('/users/me');
  },

  updateMe: (data: { name?: string; avatarUrl?: string | null }) => {
    return apiClient<{ success: boolean; data: { user: User }; message: string }>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  updatePassword: (data: { currentPassword: string; newPassword: string }) => {
    return apiClient<{ success: boolean; message: string }>('/users/me/password', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Admin APIs
  listUsers: (params?: { page?: number; limit?: number; search?: string }) => {
    return apiClient<{
      success: boolean;
      data: User[];
      pagination: { total: number; page: number; limit: number; totalPages: number };
    }>('/users', { params });
  },

  getUserById: (id: string) => {
    return apiClient<{ success: boolean; data: { user: User } }>(`/users/${id}`);
  },

  createUser: (data: {
    name: string;
    email: string;
    password: string;
    roles: string[];
    status?: UserStatus;
    emailVerified?: boolean;
  }) => {
    return apiClient<{ success: boolean; data: { user: User }; message: string }>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateUser: (
    id: string,
    data: { name?: string; status?: UserStatus; emailVerified?: boolean; avatarUrl?: string | null }
  ) => {
    return apiClient<{ success: boolean; data: { user: User }; message: string }>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteUser: (id: string) => {
    return apiClient<{ success: boolean; message: string }>(`/users/${id}`, {
      method: 'DELETE',
    });
  },
};
