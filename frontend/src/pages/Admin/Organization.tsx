// src/pages/Admin/Organization.tsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useOrganization } from '../../context/OrganizationContext';
import { organizationApi } from '../../lib/api/organization.api';
import { roleApi } from '../../lib/api/role.api';
import { OrganizationMember, OrganizationInvitation, Role } from '../../types';
import { Button, Card, Badge, Input, cn } from '../../components/ui';

export const OrganizationManagementPage: React.FC = () => {
  const { activeOrganization, activeRole, refreshOrganizations, createOrganization } = useOrganization();
  const [activeTab, setActiveTab] = useState<'members' | 'invitations' | 'settings'>('members');
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviteLinkResult, setInviteLinkResult] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  // Create org modal state
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDesc, setNewOrgDesc] = useState('');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

  // Settings update state
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const isAdmin = activeRole === 'super_admin' || activeRole === 'org_admin';

  const fetchData = async () => {
    if (!activeOrganization) return;
    try {
      setIsLoading(true);
      setError(null);

      const [membersData, invitesData, rolesData] = await Promise.all([
        organizationApi.getMembers(activeOrganization.id),
        isAdmin ? organizationApi.getInvitations(activeOrganization.id) : Promise.resolve([]),
        roleApi.getRoles(),
      ]);

      setMembers(membersData);
      setInvitations(invitesData);
      setRoles(rolesData);
      setEditName(activeOrganization.name);
      setEditDesc(activeOrganization.description || '');
    } catch (err: any) {
      setError(err.message || 'Failed to load organization details');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeOrganization?.id, activeRole]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrganization || !inviteEmail || !inviteRoleId) return;

    try {
      setIsInviting(true);
      setError(null);
      const res = await organizationApi.inviteMember(activeOrganization.id, {
        email: inviteEmail,
        roleId: inviteRoleId,
      });

      setSuccessMsg(`Invitation dispatched to ${inviteEmail}`);
      if (res.invitationLink) {
        setInviteLinkResult(res.invitationLink);
      } else {
        setShowInviteModal(false);
      }
      setInviteEmail('');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevokeInvite = async (invitationId: string) => {
    if (!activeOrganization) return;
    try {
      await organizationApi.revokeInvitation(activeOrganization.id, invitationId);
      setSuccessMsg('Invitation revoked');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke invitation');
    }
  };

  const handleUpdateRole = async (userId: string, newRoleId: string) => {
    if (!activeOrganization) return;
    try {
      await organizationApi.updateMemberRole(activeOrganization.id, userId, newRoleId);
      setSuccessMsg('Member role updated');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update member role');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!activeOrganization || !window.confirm('Are you sure you want to remove this member from the organization?')) return;
    try {
      await organizationApi.removeMember(activeOrganization.id, userId);
      setSuccessMsg('Member removed from organization');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to remove member');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrganization) return;
    try {
      setIsSavingSettings(true);
      await organizationApi.updateOrganization(activeOrganization.id, {
        name: editName,
        description: editDesc,
      });
      setSuccessMsg('Organization profile updated');
      await refreshOrganizations();
    } catch (err: any) {
      setError(err.message || 'Failed to update organization');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    try {
      setIsCreatingOrg(true);
      await createOrganization({
        name: newOrgName.trim(),
        description: newOrgDesc.trim() || undefined,
      });
      setShowCreateOrgModal(false);
      setNewOrgName('');
      setNewOrgDesc('');
      setSuccessMsg('New organization established');
    } catch (err: any) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setIsCreatingOrg(false);
    }
  };

  if (!activeOrganization) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 max-w-7xl mx-auto flex items-center justify-center font-mono">
        <Card className="p-8 text-center max-w-md w-full border-[var(--border-accent)]">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-muted)] text-[var(--accent)] flex items-center justify-center mx-auto mb-4 border border-[var(--border-accent)]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-[var(--text-1)] mb-2 font-mono">No Active Organization</h2>
          <p className="text-xs text-[var(--text-3)] mb-6">You are not currently enrolled in any organization context.</p>
          <Button onClick={() => setShowCreateOrgModal(true)} variant="primary" className="w-full">
            Establish Organization
          </Button>

          {/* Create Organization Modal */}
          {showCreateOrgModal && (
            <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 text-left">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[var(--surface)] border border-[var(--border-strong)] rounded-2xl max-w-md w-full p-6 shadow-2xl font-mono text-xs"
              >
                <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-3">
                  <h3 className="text-sm font-bold text-[var(--text-1)]">Establish New Organization Context</h3>
                  <button onClick={() => setShowCreateOrgModal(false)} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateOrg} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                      Organization Name
                    </label>
                    <Input
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      placeholder="e.g. Interpol Cyber Taskforce Alpha"
                      required
                      className="w-full text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                      Operational Description (Optional)
                    </label>
                    <textarea
                      value={newOrgDesc}
                      onChange={(e) => setNewOrgDesc(e.target.value)}
                      rows={3}
                      placeholder="Security domain and jurisdiction scope..."
                      className="w-full bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl p-3 text-xs text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)] font-mono"
                    />
                  </div>

                  <div className="pt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-1/2"
                      onClick={() => setShowCreateOrgModal(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      className="w-1/2"
                      disabled={isCreatingOrg || !newOrgName.trim()}
                      loading={isCreatingOrg}
                    >
                      Establish
                    </Button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-16 px-4 sm:px-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--accent)] mb-1">
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
            ORGANIZATION & TENANT CONTROLS
          </div>
          <h1 className="text-2xl font-bold font-mono text-[var(--text-1)] flex items-center gap-3">
            {activeOrganization.name}
            <Badge variant="accent" size="sm">
              {activeOrganization.status}
            </Badge>
          </h1>
          <p className="text-xs font-mono text-[var(--text-3)] mt-1">
            Tenant ID: <span className="text-[var(--text-2)]">{activeOrganization.id}</span> · Slug: <span className="text-[var(--text-2)]">{activeOrganization.slug}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button size="sm" variant="primary" onClick={() => setShowInviteModal(true)}>
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Invite Member
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowCreateOrgModal(true)}>
            + New Organization
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-[var(--threat-muted)] border border-[var(--threat)]/40 text-[var(--threat)] text-xs font-mono flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="underline ml-4">Dismiss</button>
        </div>
      )}

      {successMsg && (
        <div className="mb-6 p-4 rounded-xl bg-[var(--safe-muted)] border border-[var(--safe)]/40 text-[var(--safe)] text-xs font-mono flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="underline ml-4">Dismiss</button>
        </div>
      )}

      {/* Tabs Header */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] mb-6 text-xs font-mono">
        <button
          onClick={() => setActiveTab('members')}
          className={cn(
            'px-4 py-2.5 font-medium transition-colors border-b-2 -mb-px flex items-center gap-2',
            activeTab === 'members'
              ? 'border-[var(--accent)] text-[var(--accent)] font-bold'
              : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]'
          )}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          Active Members ({members.length})
        </button>

        {isAdmin && (
          <button
            onClick={() => setActiveTab('invitations')}
            className={cn(
              'px-4 py-2.5 font-medium transition-colors border-b-2 -mb-px flex items-center gap-2',
              activeTab === 'invitations'
                ? 'border-[var(--accent)] text-[var(--accent)] font-bold'
                : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]'
            )}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Pending Invitations ({invitations.filter((i) => !i.accepted_at && !i.revoked_at).length})
          </button>
        )}

        {isAdmin && (
          <button
            onClick={() => setActiveTab('settings')}
            className={cn(
              'px-4 py-2.5 font-medium transition-colors border-b-2 -mb-px flex items-center gap-2',
              activeTab === 'settings'
                ? 'border-[var(--accent)] text-[var(--accent)] font-bold'
                : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]'
            )}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Organization Settings
          </button>
        )}
      </div>

      {/* Tab: Members */}
      {activeTab === 'members' && (
        <Card className="overflow-hidden border-[var(--border)] shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[var(--surface-raised)] border-b border-[var(--border)] text-[var(--text-3)] uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Officer / User</th>
                  <th className="px-6 py-3.5">Organization Role</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Joined Date</th>
                  {isAdmin && <th className="px-6 py-3.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-[var(--text-3)]">
                      Loading membership roster...
                    </td>
                  </tr>
                ) : members.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-[var(--text-3)]">
                      No members assigned to this organization yet.
                    </td>
                  </tr>
                ) : (
                  members.map((m) => (
                    <tr key={m.user_id} className="hover:bg-[var(--surface-raised)]/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] font-bold flex items-center justify-center border border-[var(--border-accent)]">
                            {(m.name || m.user_name || 'Member').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-[var(--text-1)]">{m.name || m.user_name || 'Member'}</div>
                            <div className="text-[10px] text-[var(--text-3)]">{m.email || m.user_email || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {isAdmin ? (
                          <select
                            value={m.role_id}
                            onChange={(e) => handleUpdateRole(m.user_id, e.target.value)}
                            className="bg-[var(--surface-raised)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)]"
                          >
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge variant="accent" size="sm">
                            {m.role_name}
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={m.membership_status === 'ACTIVE' ? 'safe' : 'threat'} size="sm">
                          {m.membership_status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-[var(--text-3)]">
                        {new Date(m.joined_at).toLocaleDateString()}
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleRemoveMember(m.user_id)}
                            className="text-[var(--threat)] hover:text-red-400 text-xs transition-colors p-1"
                            title="Remove Member"
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab: Invitations */}
      {activeTab === 'invitations' && (
        <Card className="overflow-hidden border-[var(--border)] shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[var(--surface-raised)] border-b border-[var(--border)] text-[var(--text-3)] uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Invited Email</th>
                  <th className="px-6 py-3.5">Assigned Role</th>
                  <th className="px-6 py-3.5">Dispatched By</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Expires</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]">
                {invitations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-[var(--text-3)]">
                      No active invitations pending. Click "Invite Member" to dispatch an onboarding invite.
                    </td>
                  </tr>
                ) : (
                  invitations.map((inv) => {
                    const isExpired = new Date(inv.expires_at) < new Date();
                    let status = 'PENDING';
                    let statusVariant: any = 'warning';

                    if (inv.accepted_at) {
                      status = 'ACCEPTED';
                      statusVariant = 'safe';
                    } else if (inv.revoked_at) {
                      status = 'REVOKED';
                      statusVariant = 'threat';
                    } else if (isExpired) {
                      status = 'EXPIRED';
                      statusVariant = 'threat';
                    }

                    return (
                      <tr key={inv.id} className="hover:bg-[var(--surface-raised)]/40 transition-colors">
                        <td className="px-6 py-4 font-bold text-[var(--text-1)]">{inv.email}</td>
                        <td className="px-6 py-4">
                          <Badge variant="accent" size="sm">{inv.role_name}</Badge>
                        </td>
                        <td className="px-6 py-4 text-[var(--text-3)]">{inv.inviter_name || 'Admin'}</td>
                        <td className="px-6 py-4">
                          <Badge variant={statusVariant} size="sm">{status}</Badge>
                        </td>
                        <td className="px-6 py-4 text-[var(--text-3)]">{new Date(inv.expires_at).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-right">
                          {!inv.accepted_at && !inv.revoked_at && !isExpired && (
                            <button
                              onClick={() => handleRevokeInvite(inv.id)}
                              className="text-[var(--threat)] hover:text-red-400 transition-colors"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab: Settings */}
      {activeTab === 'settings' && (
        <Card className="p-6 max-w-2xl border-[var(--border)]">
          <form onSubmit={handleSaveSettings} className="space-y-4 font-mono">
            <div>
              <label className="block text-xs font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                Organization Display Name
              </label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                className="w-full text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                Mission / Security Description
              </label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={4}
                className="w-full bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl p-3 text-xs text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)] font-mono"
              />
            </div>

            <div className="pt-2">
              <Button type="submit" variant="primary" disabled={isSavingSettings}>
                {isSavingSettings ? 'Saving Settings...' : 'Update Organization Profile'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--surface)] border border-[var(--border-strong)] rounded-2xl max-w-md w-full p-6 shadow-2xl font-mono text-xs"
          >
            <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-1)]">Invite New Officer to Organization</h3>
              <button onClick={() => { setShowInviteModal(false); setInviteLinkResult(null); }} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                ✕
              </button>
            </div>

            {inviteLinkResult ? (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-[var(--safe-muted)] border border-[var(--safe)]/40 text-[var(--safe)] text-xs">
                  ✅ Invitation generated successfully! Provide this onboarding link to the officer:
                </div>
                <div className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] break-all select-all font-mono text-[11px] text-[var(--accent)]">
                  {inviteLinkResult}
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLinkResult);
                    setSuccessMsg('Invitation link copied to clipboard');
                  }}
                >
                  Copy Invitation Link
                </Button>
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => { setShowInviteModal(false); setInviteLinkResult(null); }}
                >
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                    Officer Email Address
                  </label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="officer@docshield.ai"
                    required
                    className="w-full text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                    Assigned Role
                  </label>
                  <select
                    value={inviteRoleId}
                    onChange={(e) => setInviteRoleId(e.target.value)}
                    required
                    className="w-full bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl p-3 text-xs text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">Select organizational role...</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.slug})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-1/2"
                    onClick={() => setShowInviteModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-1/2"
                    disabled={isInviting || !inviteEmail || !inviteRoleId}
                  >
                    {isInviting ? 'Dispatching...' : 'Send Invitation'}
                  </Button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}

      {/* Create Organization Modal */}
      {showCreateOrgModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--surface)] border border-[var(--border-strong)] rounded-2xl max-w-md w-full p-6 shadow-2xl font-mono text-xs"
          >
            <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-1)]">Establish New Organization Context</h3>
              <button onClick={() => setShowCreateOrgModal(false)} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                  Organization Name
                </label>
                <Input
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="e.g. Interpol Cyber Taskforce Alpha"
                  required
                  className="w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                  Operational Description (Optional)
                </label>
                <textarea
                  value={newOrgDesc}
                  onChange={(e) => setNewOrgDesc(e.target.value)}
                  rows={3}
                  placeholder="Security domain and jurisdiction scope..."
                  className="w-full bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl p-3 text-xs text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)] font-mono"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-1/2"
                  onClick={() => setShowCreateOrgModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="w-1/2"
                  disabled={isCreatingOrg || !newOrgName.trim()}
                >
                  {isCreatingOrg ? 'Creating...' : 'Establish'}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};
