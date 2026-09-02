// src/context/OrganizationContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Organization } from '../types';
import { organizationApi, CreateOrganizationInput } from '../lib/api/organization.api';
import { setActiveOrganizationId, getActiveOrganizationId } from '../lib/api/client';
import { useAuth } from './AuthContext';

interface OrganizationContextType {
  organizations: Organization[];
  activeOrganization: Organization | null;
  activeRole: string | null;
  isLoading: boolean;
  switchOrganization: (orgId: string) => void;
  refreshOrganizations: () => Promise<void>;
  createOrganization: (input: CreateOrganizationInput) => Promise<Organization>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export const OrganizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganization, setActiveOrgState] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshOrganizations = useCallback(async () => {
    if (!isAuthenticated) {
      setOrganizations([]);
      setActiveOrgState(null);
      setActiveOrganizationId(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const orgs = await organizationApi.getMyOrganizations();
      setOrganizations(orgs);

      const savedOrgId = getActiveOrganizationId();
      let current = orgs.find((o) => o.id === savedOrgId);

      if (!current && orgs.length > 0) {
        current = orgs[0];
      }

      if (current) {
        setActiveOrgState(current);
        setActiveOrganizationId(current.id);
      } else {
        setActiveOrgState(null);
        setActiveOrganizationId(null);
      }
    } catch (err) {
      console.error('Failed to fetch user organizations:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refreshOrganizations();
  }, [refreshOrganizations, user]);

  const switchOrganization = (orgId: string) => {
    const target = organizations.find((o) => o.id === orgId);
    if (target) {
      setActiveOrgState(target);
      setActiveOrganizationId(target.id);
      // Trigger a page refresh or soft reload if needed
      window.dispatchEvent(new CustomEvent('organization_changed', { detail: target }));
    }
  };

  const createOrganization = async (input: CreateOrganizationInput): Promise<Organization> => {
    const newOrg = await organizationApi.createOrganization(input);
    await refreshOrganizations();
    switchOrganization(newOrg.id);
    return newOrg;
  };

  const activeRole = activeOrganization?.role_slug || (user?.roles?.includes('super_admin') ? 'super_admin' : 'member');

  return (
    <OrganizationContext.Provider
      value={{
        organizations,
        activeOrganization,
        activeRole,
        isLoading,
        switchOrganization,
        refreshOrganizations,
        createOrganization,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
};
