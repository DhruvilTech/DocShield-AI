// src/lib/api/organization.api.ts
import { apiClient } from './client';
import { Organization, OrganizationMember, OrganizationInvitation } from '../../types';

export interface CreateOrganizationInput {
  name: string;
  slug?: string;
  description?: string;
  logoUrl?: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  description?: string;
  logoUrl?: string;
  status?: string;
}

export interface InviteMemberInput {
  email: string;
  roleId: string;
}

export const organizationApi = {
  // Organizations
  async getMyOrganizations(): Promise<Organization[]> {
    const res = await apiClient<{ success: boolean; data: { organizations: Organization[] } }>('/organizations');
    return res.data?.organizations || [];
  },

  async getAllOrganizations(params?: Record<string, any>): Promise<{ data: Organization[]; pagination: any }> {
    const res = await apiClient('/organizations', { params: { ...params, all: 'true' } });
    return { data: res.data || [], pagination: res.pagination };
  },

  async getOrganization(id: string): Promise<Organization> {
    const res = await apiClient<{ success: boolean; data: { organization: Organization } }>(`/organizations/${id}`);
    return res.data.organization;
  },

  async createOrganization(input: CreateOrganizationInput): Promise<Organization> {
    const res = await apiClient<{ success: boolean; data: { organization: Organization } }>('/organizations', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.data.organization;
  },

  async updateOrganization(id: string, input: UpdateOrganizationInput): Promise<Organization> {
    const res = await apiClient<{ success: boolean; data: { organization: Organization } }>(`/organizations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return res.data.organization;
  },

  async deleteOrganization(id: string): Promise<void> {
    await apiClient(`/organizations/${id}`, { method: 'DELETE' });
  },

  // Members
  async getMembers(orgId: string, params?: Record<string, any>): Promise<OrganizationMember[]> {
    const res = await apiClient<{ success: boolean; data: { members: OrganizationMember[] } }>(`/organizations/${orgId}/members`, {
      params,
    });
    return res.data?.members || [];
  },

  async addMember(orgId: string, userId: string, roleId: string): Promise<OrganizationMember> {
    const res = await apiClient<{ success: boolean; data: { member: OrganizationMember } }>(`/organizations/${orgId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, roleId }),
    });
    return res.data.member;
  },

  async updateMemberRole(orgId: string, userId: string, roleId: string, status?: string): Promise<OrganizationMember> {
    const res = await apiClient<{ success: boolean; data: { member: OrganizationMember } }>(`/organizations/${orgId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ roleId, status }),
    });
    return res.data.member;
  },

  async removeMember(orgId: string, userId: string): Promise<void> {
    await apiClient(`/organizations/${orgId}/members/${userId}`, { method: 'DELETE' });
  },

  // Invitations
  async getInvitations(orgId: string): Promise<OrganizationInvitation[]> {
    const res = await apiClient<{ success: boolean; data: { invitations: OrganizationInvitation[] } }>(`/organizations/${orgId}/invitations`);
    return res.data?.invitations || [];
  },

  async inviteMember(orgId: string, input: InviteMemberInput): Promise<{ invitation: OrganizationInvitation; rawToken?: string; invitationLink?: string }> {
    const res = await apiClient<{ success: boolean; data: any }>(`/organizations/${orgId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.data;
  },

  async revokeInvitation(orgId: string, invitationId: string): Promise<void> {
    await apiClient(`/organizations/${orgId}/invitations/${invitationId}`, { method: 'DELETE' });
  },
};
