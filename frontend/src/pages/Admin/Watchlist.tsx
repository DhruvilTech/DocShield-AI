// src/pages/Admin/Watchlist.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge, Card, Button, SectionHeader, Input, cn } from '../../components/ui';
import { watchlistApi, CreateWatchlistParams } from '../../lib/api/watchlist.api';
import { WatchlistEntry, RiskLevel } from '../../types';
import { formatDate } from '../../lib/date';

const RISK_BADGES: Record<RiskLevel, 'threat' | 'warning' | 'info' | 'safe'> = {
  CRITICAL: 'threat',
  HIGH: 'threat',
  MEDIUM: 'warning',
  LOW: 'info',
};

export const WatchlistManagementPage: React.FC = () => {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<CreateWatchlistParams>({
    documentNumber: '',
    fullName: '',
    nationality: '',
    reason: 'STOLEN_PASSPORT_ALERT',
    riskLevel: 'CRITICAL',
    listedBy: 'INTERPOL_SLTD',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchWatchlists = useCallback(async () => {
    try {
      setLoading(true);
      const res = await watchlistApi.listWatchlists({ search: search.trim() || undefined });
      setEntries(res.data);
    } catch (err: any) {
      console.error('Failed to load watchlists', err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchWatchlists();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchWatchlists]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.documentNumber || !formData.reason) return;
    try {
      setSubmitting(true);
      setErrorMsg(null);
      await watchlistApi.createWatchlistEntry(formData);
      setIsModalOpen(false);
      setFormData({
        documentNumber: '',
        fullName: '',
        nationality: '',
        reason: 'STOLEN_PASSPORT_ALERT',
        riskLevel: 'CRITICAL',
        listedBy: 'INTERPOL_SLTD',
      });
      await fetchWatchlists();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create watchlist alert');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this watchlist alert?')) return;
    try {
      await watchlistApi.deleteWatchlistEntry(id);
      await fetchWatchlists();
    } catch (err: any) {
      alert(err.message || 'Failed to deactivate entry');
    }
  };

  return (
    <div className="min-h-screen pt-14 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <SectionHeader
            eyebrow="Border Security Intelligence"
            title="Travel Document & Watchlist Database"
            description="Manage Interpol Stolen and Lost Travel Documents (SLTD), travel bans, and flagged impersonation alerts."
            className="mb-0"
          />

          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Register Alert
            </Button>
          </div>
        </div>

        {/* Search Bar & Summary Stats */}
        <div className="grid sm:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 sm:col-span-2">
            <div className="relative">
              <Input
                placeholder="Search by Document #, Passenger Name, or Reason..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[var(--surface-raised)] pl-9"
              />
              <svg
                className="w-4 h-4 absolute left-3 top-3 text-[var(--text-3)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block">Active Alerts</span>
              <span className="text-2xl font-bold font-mono text-[var(--threat)]">{entries.length}</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[var(--threat)]/10 text-[var(--threat)] flex items-center justify-center font-mono text-sm font-bold">
              🚨
            </div>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block">SLTD Sync</span>
              <span className="text-sm font-bold font-mono text-[var(--safe)]">Connected & Live</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[var(--safe)]/10 text-[var(--safe)] flex items-center justify-center font-mono text-sm font-bold">
              🌐
            </div>
          </Card>
        </div>

        {/* Watchlist Table */}
        <Card className="overflow-hidden border-[var(--border)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--surface-raised)] border-b border-[var(--border)] text-[10px] font-mono uppercase text-[var(--text-3)]">
                <tr>
                  <th className="px-4 py-3">Document #</th>
                  <th className="px-4 py-3">Subject Name</th>
                  <th className="px-4 py-3">Nationality</th>
                  <th className="px-4 py-3">Alert Reason</th>
                  <th className="px-4 py-3">Risk Level</th>
                  <th className="px-4 py-3">Origin Authority</th>
                  <th className="px-4 py-3">Date Listed</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-[var(--text-3)] font-mono">
                      Querying Interpol & Border Database...
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-[var(--text-3)] font-mono">
                      No matching watchlist alerts found.
                    </td>
                  </tr>
                ) : (
                  entries.map((item) => (
                    <tr key={item.id} className="hover:bg-[var(--surface-alt)]/50 transition-colors font-mono">
                      <td className="px-4 py-3.5 font-bold text-[var(--text-1)]">{item.document_number}</td>
                      <td className="px-4 py-3.5 text-[var(--text-1)] font-sans">{item.full_name || '—'}</td>
                      <td className="px-4 py-3.5 text-[var(--text-2)]">{item.nationality || '—'}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-[var(--text-1)] font-medium">
                          {item.reason.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant={RISK_BADGES[item.risk_level] || 'threat'} size="sm">
                          {item.risk_level}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[var(--text-2)]">{item.listed_by}</td>
                      <td className="px-4 py-3.5 text-xs text-[var(--text-1)] font-mono">
                        {formatDate(item.created_at)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[var(--threat)] hover:bg-[var(--threat)]/10 text-[11px] h-7 px-2"
                          onClick={() => handleDelete(item.id)}
                        >
                          Revoke
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Register Modal */}
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg"
              >
                <Card className="p-6 border-[var(--border-accent)] shadow-2xl">
                  <div className="flex items-center justify-between pb-4 mb-4 border-b border-[var(--border)]">
                    <h3 className="text-sm font-bold text-[var(--text-1)] uppercase font-mono tracking-wider">
                      Register Travel Document Alert
                    </h3>
                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="text-[var(--text-3)] hover:text-[var(--text-1)] text-lg"
                    >
                      ✕
                    </button>
                  </div>

                  {errorMsg && (
                    <div className="mb-4 p-3 rounded-lg bg-[var(--threat)]/10 border border-[var(--threat)]/30 text-xs text-[var(--threat)] font-mono">
                      {errorMsg}
                    </div>
                  )}

                  <form onSubmit={handleCreate} className="space-y-4 text-xs">
                    <div>
                      <label className="block font-mono text-[10px] uppercase text-[var(--text-2)] mb-1">
                        Document Number *
                      </label>
                      <Input
                        required
                        placeholder="e.g. E88920194 or V12345678"
                        value={formData.documentNumber}
                        onChange={(e) => setFormData({ ...formData, documentNumber: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-mono text-[10px] uppercase text-[var(--text-2)] mb-1">
                          Full Name (Optional)
                        </label>
                        <Input
                          placeholder="e.g. Alexander Rostov"
                          value={formData.fullName}
                          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block font-mono text-[10px] uppercase text-[var(--text-2)] mb-1">
                          Nationality Code
                        </label>
                        <Input
                          placeholder="e.g. USA, GBR, RUS"
                          value={formData.nationality}
                          onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-mono text-[10px] uppercase text-[var(--text-2)] mb-1">
                          Alert Reason *
                        </label>
                        <select
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)]"
                          value={formData.reason}
                          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                        >
                          <option value="STOLEN_PASSPORT_ALERT">Stolen Passport Alert</option>
                          <option value="INTERPOL_RED_NOTICE">Interpol Red Notice</option>
                          <option value="TRAVEL_BAN_SANCTIONS">Travel Ban / Sanctions</option>
                          <option value="IDENTITY_FRAUD_SUSPECT">Identity Fraud Suspect</option>
                          <option value="FORGED_VISA_REPORTED">Forged Visa Reported</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-mono text-[10px] uppercase text-[var(--text-2)] mb-1">
                          Risk Severity
                        </label>
                        <select
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)]"
                          value={formData.riskLevel}
                          onChange={(e) => setFormData({ ...formData, riskLevel: e.target.value as any })}
                        >
                          <option value="CRITICAL">CRITICAL</option>
                          <option value="HIGH">HIGH</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="LOW">LOW</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block font-mono text-[10px] uppercase text-[var(--text-2)] mb-1">
                        Issuing / Origin Authority
                      </label>
                      <Input
                        placeholder="e.g. INTERPOL_SLTD, BORDER_CONTROL"
                        value={formData.listedBy}
                        onChange={(e) => setFormData({ ...formData, listedBy: e.target.value })}
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                      <Button variant="ghost" size="sm" type="button" onClick={() => setIsModalOpen(false)}>
                        Cancel
                      </Button>
                      <Button variant="primary" size="sm" type="submit" loading={submitting}>
                        Register Alert
                      </Button>
                    </div>
                  </form>
                </Card>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default WatchlistManagementPage;
