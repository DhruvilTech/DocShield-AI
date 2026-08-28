// src/lib/api/invitation.api.ts
import { apiClient } from './client';
import { OrganizationInvitation, OrganizationMember } from '../../types';

export const invitationApi = {
  async getInvitationDetails(token: string): Promise<OrganizationInvitation> {
    const res = await apiClient<{ success: boolean; data: { invitation: OrganizationInvitation } }>(`/invitations/${token}`, {
      skipAuth: true,
    });
    return res.data.invitation;
  },

  async acceptInvitation(token: string): Promise<OrganizationMember> {
    const res = await apiClient<{ success: boolean; data: { member: OrganizationMember } }>(`/invitations/${token}/accept`, {
      method: 'POST',
    });
    return res.data.member;
  },
};
