// src/lib/api/auth.api.ts
import { apiClient } from './client';
import { AuthResponse, AuthTokens } from '../../types';

export const authApi = {
  register: (data: { name: string; email: string; password: string; role?: string }) => {
    return apiClient<{ success: boolean; data: AuthResponse; message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
      skipAuth: true,
    });
  },

  login: (credentials: { email: string; password: string }) => {
    return apiClient<{ success: boolean; data: AuthResponse; message: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
      skipAuth: true,
    });
  },

  refresh: () => {
    return apiClient<{ success: boolean; data: { tokens: AuthTokens } }>('/auth/refresh', {
      method: 'POST',
      skipAuth: true,
    });
  },

  logout: () => {
    return apiClient<{ success: boolean; message: string }>('/auth/logout', {
      method: 'POST',
    });
  },

  forgotPassword: (email: string) => {
    return apiClient<{ success: boolean; message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
      skipAuth: true,
    });
  },

  resetPassword: (data: { token: string; password: string }) => {
    return apiClient<{ success: boolean; message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
      skipAuth: true,
    });
  },

  verifyEmail: (token: string) => {
    return apiClient<{ success: boolean; message: string }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
      skipAuth: true,
    });
  },

  resendVerification: (email: string) => {
    return apiClient<{ success: boolean; message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
      skipAuth: true,
    });
  },
};
