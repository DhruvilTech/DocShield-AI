// src/pages/Profile/index.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { userApi } from '../../lib/api/user.api';
import { Button, Card, Badge, SectionHeader } from '../../components/ui';

export const ProfilePage: React.FC = () => {
  const { user, refreshProfile, logout } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    setProfileLoading(true);
    setProfileMsg(null);

    try {
      await userApi.updateMe({ name });
      await refreshProfile();
      setProfileMsg({ type: 'success', text: 'Officer profile updated successfully.' });
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setPasswordLoading(true);
    setPasswordMsg(null);

    try {
      await userApi.updatePassword({ currentPassword, newPassword });
      setPasswordMsg({ type: 'success', text: 'Security credentials updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message || 'Failed to change password.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 sm:px-6 max-w-6xl mx-auto">
      <SectionHeader
        eyebrow="Identity & Access Management"
        title="Officer Enclave & Security Credentials"
        description="Manage your cryptographic credentials, verify active RBAC clearances, and review node security parameters."
      />

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Left Column: Officer Card & Permissions */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] text-[#05070A] flex items-center justify-center font-bold text-2xl shadow-md">
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--text-1)]">{user.name}</h3>
                <p className="text-xs font-mono text-[var(--text-2)]">{user.email}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {user.roles.map((role) => (
                    <Badge key={role} variant="accent" size="sm">
                      {role.replace('_', ' ').toUpperCase()}
                    </Badge>
                  ))}
                  {user.emailVerified ? (
                    <Badge variant="safe" size="sm" dot>
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="warning" size="sm">
                      Unverified
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-[var(--border)] text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-[var(--text-3)]">NODE STATUS:</span>
                <span className="text-[var(--safe)] font-semibold">{user.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-3)]">OPERATOR ID:</span>
                <span className="text-[var(--text-2)] truncate max-w-[180px]">{user.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-3)]">REGISTERED AT:</span>
                <span className="text-[var(--text-2)]">
                  {new Date(user.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-3)]">LAST AUTHENTICATION:</span>
                <span className="text-[var(--text-2)]">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'First Session'}
                </span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[var(--border)]">
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="w-full text-[var(--threat)] hover:bg-[var(--threat)]/10"
              >
                Terminate Session (Logout)
              </Button>
            </div>
          </Card>

          {/* RBAC Clearances */}
          <Card className="p-6">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[var(--text-2)] font-bold mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
              Active System Permissions ({user.permissions.length})
            </h4>
            <div data-lenis-prevent className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
              {user.permissions.map((p) => (
                <span
                  key={p}
                  className="px-2 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-2)]"
                >
                  {p}
                </span>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Column: Forms */}
        <div className="lg:col-span-7 space-y-6">
          {/* Update Name Profile Form */}
          <Card className="p-6 sm:p-8">
            <h3 className="text-base font-bold text-[var(--text-1)] mb-1">Personal Details</h3>
            <p className="text-xs text-[var(--text-3)] mb-6 font-mono">Update operator alias in screening logs</p>

            {profileMsg && (
              <div
                className={`mb-4 p-3 rounded-lg text-xs ${
                  profileMsg.type === 'success'
                    ? 'bg-[var(--safe)]/10 text-[var(--safe)] border border-[var(--safe)]/20'
                    : 'bg-[var(--threat)]/10 text-[var(--threat)] border border-[var(--threat)]/20'
                }`}
              >
                {profileMsg.text}
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-medium text-[var(--text-2)] mb-1.5 uppercase">
                  Full Name / Alias
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-[var(--text-3)] mb-1.5 uppercase">
                  Email Address (Immutable)
                </label>
                <input
                  type="email"
                  disabled
                  value={user.email}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-[var(--surface)]/40 border border-[var(--border)] text-[var(--text-3)] cursor-not-allowed"
                />
              </div>

              <Button type="submit" variant="secondary" size="md" loading={profileLoading}>
                Save Details
              </Button>
            </form>
          </Card>

          {/* Change Password Form */}
          <Card className="p-6 sm:p-8">
            <h3 className="text-base font-bold text-[var(--text-1)] mb-1">Rotate Access Key</h3>
            <p className="text-xs text-[var(--text-3)] mb-6 font-mono">
              Update password credentials (revokes all other active sessions)
            </p>

            {passwordMsg && (
              <div
                className={`mb-4 p-3 rounded-lg text-xs ${
                  passwordMsg.type === 'success'
                    ? 'bg-[var(--safe)]/10 text-[var(--safe)] border border-[var(--safe)]/20'
                    : 'bg-[var(--threat)]/10 text-[var(--threat)] border border-[var(--threat)]/20'
                }`}
              >
                {passwordMsg.text}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-medium text-[var(--text-2)] mb-1.5 uppercase">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono font-medium text-[var(--text-2)] mb-1.5 uppercase">
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 chars"
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-medium text-[var(--text-2)] mb-1.5 uppercase">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                </div>
              </div>

              <Button type="submit" variant="primary" size="md" loading={passwordLoading}>
                Update Password
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
