// src/pages/Admin/Users.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { userApi } from '../../lib/api/user.api';
import { roleApi } from '../../lib/api/role.api';
import { User, Role, UserStatus } from '../../types';
import { Button, Card, Badge, SectionHeader } from '../../components/ui';

export const AdminUsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Edit / Create Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'screening_officer',
  });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await userApi.listUsers({ page, limit: 10, search });
      if (res.success) {
        setUsers(res.data);
        setTotalPages(res.pagination.totalPages || 1);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load user accounts.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    roleApi.listRoles().then((res) => {
      if (res.success && res.data?.roles) {
        setRoles(res.data.roles);
      }
    });
  }, []);

  const handleStatusChange = async (userId: string, newStatus: UserStatus) => {
    try {
      await userApi.updateUser(userId, { status: newStatus });
      await fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to update user status');
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!window.confirm(`Are you sure you want to delete user ${email}?`)) return;

    try {
      await userApi.deleteUser(userId);
      await fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await userApi.createUser({
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        roles: [newUser.role],
        status: 'ACTIVE',
        emailVerified: true,
      });
      setIsCreateModalOpen(false);
      setNewUser({ name: '', email: '', password: '', role: 'screening_officer' });
      await fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to create user');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 sm:px-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)] mb-1 font-mono">
            System Administration
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-1)] tracking-tight">
            User & Clearance Management
          </h1>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => setIsCreateModalOpen(true)}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          Add New Operator
        </Button>
      </div>

      {/* Search Bar */}
      <Card className="p-4 mb-6">
        <div className="flex items-center gap-3">
          <svg className="w-4 h-4 text-[var(--text-3)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search operators by name, email, or role..."
            className="w-full bg-transparent text-sm text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none"
          />
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 mx-auto border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin mb-3" />
            <p className="text-xs font-mono text-[var(--text-3)]">Loading operator registry…</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-[var(--threat)]">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[var(--surface-raised)] border-b border-[var(--border)] text-[var(--text-2)] uppercase">
                <tr>
                  <th className="px-6 py-3.5">Operator</th>
                  <th className="px-6 py-3.5">Clearance Roles</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Email Verified</th>
                  <th className="px-6 py-3.5">Created</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-[var(--text-1)]">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[var(--surface-raised)]/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-sm text-[var(--text-1)]">{u.name}</div>
                      <div className="text-[11px] text-[var(--text-3)]">{u.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r} variant="accent" size="sm">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={u.status}
                        onChange={(e) => handleStatusChange(u.id, e.target.value as UserStatus)}
                        className="bg-[var(--surface-raised)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:outline-none focus:border-[var(--accent)]"
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                        <option value="SUSPENDED">SUSPENDED</option>
                        <option value="PENDING_VERIFICATION">PENDING</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      {u.emailVerified ? (
                        <span className="text-[var(--safe)]">● Verified</span>
                      ) : (
                        <span className="text-[var(--warning)]">○ Pending</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[var(--text-3)]">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDeleteUser(u.id, u.email)}
                        className="text-[var(--threat)] hover:underline font-semibold"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-[var(--text-3)]">
                      No operator records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[var(--border)] flex items-center justify-between text-xs font-mono">
            <Button
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-[var(--text-2)]">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </Card>

      {/* Create User Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md"
            >
              <Card className="p-6 bg-[var(--surface)] border-[var(--border-strong)] shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-[var(--text-1)]">Create New Operator</h3>
                  <button
                    onClick={() => setIsCreateModalOpen(false)}
                    className="text-[var(--text-3)] hover:text-[var(--text-1)]"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateUser} className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono text-[var(--text-2)] mb-1 uppercase">
                      Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                      placeholder="Agent John"
                      className="w-full px-3 py-2 rounded text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-[var(--text-2)] mb-1 uppercase">
                      Email
                    </label>
                    <input
                      type="email"
                      required
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      placeholder="john@docshield.ai"
                      className="w-full px-3 py-2 rounded text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-[var(--text-2)] mb-1 uppercase">
                      Initial Password
                    </label>
                    <input
                      type="password"
                      required
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      placeholder="Min 8 chars"
                      className="w-full px-3 py-2 rounded text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-[var(--text-2)] mb-1 uppercase">
                      Assigned Role
                    </label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                      className="w-full px-3 py-2 rounded text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)]"
                    >
                      <option value="screening_officer">Screening Officer</option>
                      <option value="investigator">Investigator</option>
                      <option value="analyst_viewer">Analyst / Viewer</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>

                  <div className="flex gap-2 pt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsCreateModalOpen(false)}
                      className="w-1/2"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={actionLoading}
                      className="w-1/2"
                    >
                      Create User
                    </Button>
                  </div>
                </form>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminUsersPage;
