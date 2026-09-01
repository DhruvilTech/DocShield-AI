// src/pages/Admin/AuditTrail.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { auditApi } from '../../lib/api/audit.api';
import { AuditLog } from '../../types';
import { Button, Card, Badge, SectionHeader } from '../../components/ui';
import { formatDateTime } from '../../lib/date';

export const AuditTrailPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auditApi.listAuditLogs({
        page,
        limit: 15,
        search,
        action: actionFilter || undefined,
      });
      if (res.success) {
        setLogs(res.data);
        setTotalPages(res.pagination.totalPages || 1);
      }
    } catch (err) {
      // failed to load
    } finally {
      setLoading(false);
    }
  }, [page, search, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getActionBadgeVariant = (action: string) => {
    if (action.includes('LOGIN_FAILED') || action.includes('ALERT') || action.includes('DELETED')) {
      return 'threat';
    }
    if (action.includes('LOGIN') || action.includes('VERIFIED') || action.includes('CREATED')) {
      return 'safe';
    }
    if (action.includes('PASSWORD') || action.includes('ASSIGNED')) {
      return 'warning';
    }
    return 'neutral';
  };

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 sm:px-6 max-w-7xl mx-auto">
      <SectionHeader
        eyebrow="Security Operations Center"
        title="Digital Investigation & Security Audit Trail"
        description="Tamper-evident system event log capturing authentication, credential access, administrative changes, and document actions."
      />

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="grid sm:grid-cols-12 gap-3">
          <div className="sm:col-span-8 flex items-center gap-3">
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
              placeholder="Search by action, resource, operator name or email..."
              className="w-full bg-transparent text-sm text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none"
            />
          </div>

          <div className="sm:col-span-4">
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 rounded bg-[var(--surface-raised)] border border-[var(--border)] text-xs text-[var(--text-1)] font-mono focus:outline-none"
            >
              <option value="">All Security Actions</option>
              <option value="LOGIN">LOGIN</option>
              <option value="LOGOUT">LOGOUT</option>
              <option value="LOGIN_FAILED">LOGIN_FAILED</option>
              <option value="REGISTER">REGISTER</option>
              <option value="TOKEN_REFRESH">TOKEN_REFRESH</option>
              <option value="PASSWORD_CHANGED">PASSWORD_CHANGED</option>
              <option value="USER_CREATED">USER_CREATED</option>
              <option value="USER_UPDATED">USER_UPDATED</option>
              <option value="ROLE_ASSIGNED">ROLE_ASSIGNED</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Audit Log Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 mx-auto border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin mb-3" />
            <p className="text-xs font-mono text-[var(--text-3)]">Querying audit logs…</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[var(--surface-raised)] border-b border-[var(--border)] text-[var(--text-2)] uppercase">
                <tr>
                  <th className="px-6 py-3.5">Timestamp (UTC)</th>
                  <th className="px-6 py-3.5">Action</th>
                  <th className="px-6 py-3.5">Operator</th>
                  <th className="px-6 py-3.5">Resource</th>
                  <th className="px-6 py-3.5">Network IP</th>
                  <th className="px-6 py-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-[var(--text-1)]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--surface-raised)]/40 transition-colors">
                    <td className="px-6 py-3.5 text-xs font-mono text-[var(--text-1)]">
                      {formatDateTime(log.created_at || log.createdAt)}
                    </td>
                    <td className="px-6 py-3.5">
                      <Badge variant={getActionBadgeVariant(log.action)} size="sm">
                        {log.action}
                      </Badge>
                    </td>
                    <td className="px-6 py-3.5">
                      {log.actor_name || log.actorName ? (
                        <div>
                          <span className="font-bold text-[var(--text-1)]">{log.actor_name || log.actorName}</span>
                          <span className="text-[10px] text-[var(--text-3)] block">{log.actor_email || log.actorEmail}</span>
                        </div>
                      ) : (
                        <span className="text-[var(--text-3)] italic">System / Anonymous</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-[var(--text-2)]">
                      {log.resource_type || log.resourceType}
                      {(log.resource_id || log.resourceId) && (
                        <span className="text-[10px] text-[var(--text-3)] block truncate max-w-[120px]">
                          {log.resource_id || log.resourceId}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-[var(--text-3)]">
                      {log.ip_address || log.ipAddress || '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {log.metadata ? (
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="text-[var(--accent)] hover:underline font-bold"
                        >
                          View Payload
                        </button>
                      ) : (
                        <span className="text-[var(--text-3)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-[var(--text-3)]">
                      No security audit events matching query.
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

      {/* Metadata Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <Card className="max-w-lg w-full p-6 bg-[var(--surface)] border-[var(--border-strong)] shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[var(--text-1)] font-mono">
                Audit Event Payload [{selectedLog.action}]
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-[var(--text-3)] hover:text-[var(--text-1)]"
              >
                ✕
              </button>
            </div>
            <div className="mb-4">
              <p className="text-xs text-[var(--text-3)] font-mono mb-2">User Agent:</p>
              <p className="text-xs text-[var(--text-2)] font-mono bg-[var(--surface-raised)] p-2 rounded break-all">
                {selectedLog.user_agent || selectedLog.userAgent || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-3)] font-mono mb-2">Metadata JSON:</p>
              <pre className="text-[11px] font-mono text-[var(--accent)] bg-[var(--surface-raised)] p-3 rounded overflow-x-auto max-h-60">
                {JSON.stringify(selectedLog.metadata, null, 2)}
              </pre>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--border)] text-right">
              <Button size="sm" variant="secondary" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AuditTrailPage;
