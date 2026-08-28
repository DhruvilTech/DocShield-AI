// src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { authApi } from '../lib/api/auth.api';
import { userApi } from '../lib/api/user.api';
import { setAccessToken, getAccessToken } from '../lib/api/client';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  roles: string[];
  permissions: string[];
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (data: { name: string; email: string; password: string; role?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasRole: (role: string | string[]) => boolean;
  hasPermission: (permission: string | string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await userApi.getMe();
      if (res.success && res.data?.user) {
        setUser(res.data.user);
      } else {
        setUser(null);
        setAccessToken(null);
      }
    } catch (err) {
      setUser(null);
      setAccessToken(null);
    }
  }, []);

  // Initialize Auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      const existingToken = getAccessToken();

      // If token in memory/sessionStorage, fetch profile
      if (existingToken) {
        await refreshProfile();
      } else {
        // Try background silent refresh via HTTP-only cookie
        try {
          const res = await authApi.refresh();
          if (res.success && res.data?.tokens?.accessToken) {
            setAccessToken(res.data.tokens.accessToken);
            await refreshProfile();
          }
        } catch (err) {
          // Unauthenticated guest session
          setUser(null);
        }
      }

      setIsLoading(false);
    };

    initAuth();
  }, [refreshProfile]);

  const login = async (credentials: { email: string; password: string }) => {
    const res = await authApi.login(credentials);
    if (res.success && res.data) {
      setAccessToken(res.data.tokens.accessToken);
      setUser(res.data.user);
    }
  };

  const register = async (data: { name: string; email: string; password: string; role?: string }) => {
    const res = await authApi.register(data);
    if (res.success && res.data) {
      setAccessToken(res.data.tokens.accessToken);
      setUser(res.data.user);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      // Proceed with local logout regardless of network error
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  const hasRole = (roleInput: string | string[]): boolean => {
    if (!user) return false;
    if (user.roles.includes('super_admin')) return true;

    const required = Array.isArray(roleInput) ? roleInput : [roleInput];
    return required.some((r) => user.roles.includes(r));
  };

  const hasPermission = (permissionInput: string | string[]): boolean => {
    if (!user) return false;
    if (user.roles.includes('super_admin')) return true;

    const required = Array.isArray(permissionInput) ? permissionInput : [permissionInput];
    const userPerms = new Set(user.permissions);
    return required.every((p) => userPerms.has(p));
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    roles: user?.roles || [],
    permissions: user?.permissions || [],
    login,
    register,
    logout,
    refreshProfile,
    hasRole,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
