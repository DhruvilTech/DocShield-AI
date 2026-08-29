// src/components/auth/ProtectedRoute.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string | string[];
  requiredPermission?: string | string[];
  requireSuperAdmin?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
  requiredPermission,
  requireSuperAdmin = false,
}) => {
  const { isAuthenticated, isLoading, isSuperAdmin, hasRole, hasPermission } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
          <p className="text-xs font-mono text-[var(--text-3)]">Authenticating Secure Enclave…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return (
      <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
        <div className="max-w-md w-full p-6 rounded-2xl border border-[var(--threat)]/40 bg-[var(--surface)] text-center shadow-2xl">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--threat)]/10 text-[var(--threat)] flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v.01M12 9a2 2 0 00-2 2v2a2 2 0 002 2h0a2 2 0 002-2V11a2 2 0 00-2-2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[var(--text-1)] mb-2 font-mono">Super Admin Clearance Required</h2>
          <p className="text-xs text-[var(--text-2)] mb-6 leading-relaxed font-mono">
            This module requires top-level Super Administrator credentials. Your account is restricted to standard border operational modules.
          </p>
          <a
            href="/scanner"
            className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold font-mono rounded-lg bg-[var(--accent)] text-[#05070A] shadow-md hover:brightness-110 transition-all"
          >
            Return to Checkpoint Scanner
          </a>
        </div>
      </div>
    );
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
        <div className="max-w-md w-full p-6 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] text-center shadow-xl">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--threat)]/10 text-[var(--threat)] flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v.01M12 9a2 2 0 00-2 2v2a2 2 0 002 2h0a2 2 0 002-2V11a2 2 0 00-2-2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[var(--text-1)] mb-2">Access Restricted</h2>
          <p className="text-xs text-[var(--text-2)] mb-6 leading-relaxed">
            Your current role does not have authorization to access this security clearance zone.
          </p>
          <a
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent)] text-[#05070A]"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
        <div className="max-w-md w-full p-6 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] text-center shadow-xl">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--warning)]/10 text-[var(--warning)] flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[var(--text-1)] mb-2">Permission Denied</h2>
          <p className="text-xs text-[var(--text-2)] mb-6 leading-relaxed">
            You do not have the required RBAC system permissions to view this resource.
          </p>
          <a
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--surface-raised)] text-[var(--text-1)] border border-[var(--border)]"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
