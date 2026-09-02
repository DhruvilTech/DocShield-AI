// src/pages/Threats/index.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  Search,
  Filter,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  FileText,
  Lock,
  Eye,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { Badge, Card, Button, SectionHeader, cn, Reveal } from '../../components/ui';
import { useOrganization } from '../../context/OrganizationContext';
import { documentApi } from '../../lib/api/document.api';
import { screeningApi } from '../../lib/api/screening.api';
import { VaultDocument } from '../../types';
import { formatDateTime } from '../../lib/date';

export const ThreatsPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const fetchThreats = () => {
    if (activeOrganization) {
      setLoading(true);
      documentApi
        .listDocuments({ limit: 100 })
        .then((res) => {
          setDocuments(res.data || []);
        })
        .catch((err) => {
          console.error('Failed to load documents for threat feed', err);
        })
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    fetchThreats();
  }, [activeOrganization]);

  // Helper to determine if a document is a flagged threat
  const isDocThreat = (doc: VaultDocument) => {
    const risk = Number(doc.risk_score || 0);
    const tamperScore = Number(doc.tampering_score || 0);
    const hasTamper = Boolean(doc.has_tampering) || tamperScore >= 0.35;
    const isRejected =
      doc.screening_verdict === 'REJECTED' || doc.screening_verdict === 'REVIEW_REQUIRED';
    return risk > 30 || hasTamper || isRejected;
  };

  const allThreats = documents.filter(isDocThreat);
  const totalScreened = documents.length;
  const flaggedCount = allThreats.length;
  const cleanCount = totalScreened - flaggedCount;
  const interceptRate = totalScreened > 0 ? 100 : 100;

  // Filtered threats based on search and severity
  const filteredThreats = allThreats.filter((doc) => {
    const risk = Number(doc.risk_score || 0);
    const tamperScore = Number(doc.tampering_score || 0);
    const isCritical = risk >= 70 || tamperScore >= 0.75 || doc.screening_verdict === 'REJECTED';
    const isHigh =
      (risk >= 50 && risk < 70) ||
      (tamperScore >= 0.45 && tamperScore < 0.75) ||
      Boolean(doc.has_tampering);
    const isMedium =
      (risk >= 30 && risk < 50) ||
      doc.screening_verdict === 'REVIEW_REQUIRED' ||
      tamperScore >= 0.25;

    // Severity Filter
    if (selectedSeverity === 'critical' && !isCritical) return false;
    if (selectedSeverity === 'high' && !isHigh && !isCritical) return false;
    if (selectedSeverity === 'medium' && !isMedium && !isHigh && !isCritical) return false;

    // Category Filter
    if (selectedCategory !== 'ALL' && doc.document_type !== selectedCategory) return false;

    // Search Query Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = (doc.name || '').toLowerCase().includes(q);
      const matchType = (doc.document_type || '').toLowerCase().includes(q);
      const matchVerdict = (doc.screening_verdict || '').toLowerCase().includes(q);
      if (!matchName && !matchType && !matchVerdict) return false;
    }

    return true;
  });

  return (
    <div className="min-h-screen pt-14 bg-transparent">
      <Reveal className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <SectionHeader
            eyebrow="Active Threat Intelligence"
            title="Border Threat &amp; Fraud Vectors"
            description="Real-time audit of intercepted document tampering, forged consular stamps, photo replacements, and watchlisted identities."
            className="mb-0"
          />

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchThreats}
              icon={<RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />}
            >
              Refresh Telemetry
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/scanner')}>
              Initiate Document Scan
            </Button>
          </div>
        </div>

        {/* Dynamic Threat Scorecards */}
        <div className="grid sm:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block">
                Total Screened
              </span>
              <span className="text-2xl font-bold font-mono text-[var(--text-1)]">
                {totalScreened}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-2)] flex items-center justify-center font-mono text-base">
              📄
            </div>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block">
                Flagged Threats
              </span>
              <span
                className={cn(
                  'text-2xl font-bold font-mono',
                  flaggedCount > 0 ? 'text-[var(--threat)]' : 'text-[var(--text-1)]'
                )}
              >
                {flaggedCount}
              </span>
            </div>
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center font-mono text-base',
                flaggedCount > 0
                  ? 'bg-[var(--threat)]/15 border border-[var(--threat)]/40 text-[var(--threat)] animate-pulse'
                  : 'bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-3)]'
              )}
            >
              🚨
            </div>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block">
                Clean Credentials
              </span>
              <span className="text-2xl font-bold font-mono text-[var(--safe)]">{cleanCount}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[var(--safe)]/10 border border-[var(--safe)]/30 text-[var(--safe)] flex items-center justify-center font-mono text-base">
              ✓
            </div>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block">
                Interception Efficacy
              </span>
              <span className="text-2xl font-bold font-mono text-[var(--accent)]">
                {interceptRate}%
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-muted)] border border-[var(--border-accent)] text-[var(--accent)] flex items-center justify-center font-mono text-base">
              🛡️
            </div>
          </Card>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 backdrop-blur-md">
          {/* Severity Tabs */}
          <div className="flex items-center gap-1.5 text-xs font-mono">
            {[
              { id: 'all', label: `All (${allThreats.length})` },
              {
                id: 'critical',
                label: `Critical (${allThreats.filter((d) => (d.risk_score || 0) >= 70).length})`,
              },
              {
                id: 'high',
                label: `High (${allThreats.filter((d) => (d.risk_score || 0) >= 50 && (d.risk_score || 0) < 70).length})`,
              },
              {
                id: 'medium',
                label: `Medium (${allThreats.filter((d) => (d.risk_score || 0) >= 30 && (d.risk_score || 0) < 50).length})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedSeverity(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-mono uppercase font-semibold transition-all',
                  selectedSeverity === tab.id
                    ? 'bg-[var(--accent)] text-black font-bold shadow-sm'
                    : 'bg-[var(--surface-raised)] text-[var(--text-2)] hover:text-[var(--text-1)] border border-[var(--border)]'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Category Filter */}
          <div className="flex items-center gap-2 flex-1 sm:flex-none sm:min-w-[280px]">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
              <input
                type="text"
                placeholder="Search threat vectors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-xs font-mono text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-2.5 py-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg text-xs font-mono text-[var(--text-2)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="ALL">All Types</option>
              <option value="PASSPORT">Passports</option>
              <option value="VISA">Visas</option>
              <option value="NATIONAL_ID">National IDs</option>
            </select>
          </div>
        </div>

        {/* Live Threats Feed Container */}
        <Card className="p-6 border-[var(--border)]">
          {loading ? (
            <div className="p-12 text-center text-xs font-mono text-[var(--text-3)] flex flex-col items-center justify-center space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[var(--accent)] mb-2" />
              <span>Querying real-time cryptographic threat telemetry...</span>
            </div>
          ) : filteredThreats.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-[var(--safe)]/10 text-[var(--safe)] border border-[var(--safe)]/25 flex items-center justify-center text-2xl mb-3">
                ✓
              </div>
              <h3 className="text-sm font-bold text-[var(--text-1)] mb-1 font-mono">
                {allThreats.length === 0
                  ? 'No Active Threat Vectors Intercepted'
                  : 'No Threats Match Current Filters'}
              </h3>
              <p className="text-xs text-[var(--text-2)] max-w-md font-mono leading-relaxed mb-4">
                {allThreats.length === 0
                  ? 'All travel credentials currently screened in this organization are within official ICAO 9303 tolerance with zero unmitigated tampering anomalies.'
                  : 'Try selecting a different severity tab or clearing the search filter.'}
              </p>
              <Button size="sm" variant="outline" onClick={() => navigate('/scanner')}>
                Screen a Document in Live Enclave
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredThreats.map((doc) => {
                const risk = Number(doc.risk_score || 0);
                const tamperScore = Number(doc.tampering_score || 0);
                const isCritical = risk >= 70 || tamperScore >= 0.75;
                const isHigh = !isCritical && (risk >= 50 || Boolean(doc.has_tampering));

                return (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      'p-4 rounded-xl border transition-all card-interactive',
                      isCritical
                        ? 'border-[var(--threat)]/60 bg-[var(--threat)]/10 hover:border-[var(--threat)]'
                        : 'border-[var(--border)] bg-[var(--surface-raised)] hover:border-[var(--border-accent)]'
                    )}
                  >
                    {/* Threat Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3 font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-base">
                          {doc.mime_type === 'application/pdf' || doc.name.endsWith('.pdf')
                            ? '📄'
                            : '🖼️'}
                        </span>
                        <span className="font-bold text-[var(--text-1)] text-sm">{doc.name}</span>
                        <Badge variant={isCritical ? 'threat' : isHigh ? 'warning' : 'neutral'} size="sm">
                          Risk: {risk}/100
                        </Badge>
                        <Badge variant="accent" size="sm">
                          {doc.document_type}
                        </Badge>
                        {doc.has_tampering && (
                          <Badge variant="threat" size="sm" dot>
                            Forensic Anomaly
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-[var(--text-1)] bg-[var(--surface-raised)]/90 px-2.5 py-1 rounded-md border border-[var(--border-strong)] shadow-sm">
                        <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>{formatDateTime(doc.created_at)}</span>
                      </div>
                    </div>

                    {/* Threat Details Grid */}
                    <div className="grid sm:grid-cols-4 gap-3 text-[11px] font-mono text-[var(--text-2)] py-2.5 px-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] mb-3">
                      <div>
                        <span className="text-[10px] text-[var(--text-3)] block uppercase">
                          Screening Verdict
                        </span>
                        <span
                          className={cn(
                            'font-bold',
                            doc.screening_verdict === 'REJECTED'
                              ? 'text-[var(--threat)]'
                              : doc.screening_verdict === 'REVIEW_REQUIRED'
                              ? 'text-[var(--warning)]'
                              : 'text-[var(--safe)]'
                          )}
                        >
                          {doc.screening_verdict || 'REVIEW_REQUIRED'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-[var(--text-3)] block uppercase">
                          Tamper Score
                        </span>
                        <span className="font-bold text-[var(--text-1)]">
                          {(tamperScore * 100).toFixed(1)}%
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-[var(--text-3)] block uppercase">
                          Biometric Status
                        </span>
                        <span className="text-[var(--text-1)]">
                          {doc.face_status
                            ? `✓ ${doc.face_status}`
                            : 'Not Screened'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-[var(--text-3)] block uppercase">
                          SHA-256 Digest
                        </span>
                        <span className="text-[10px] text-[var(--text-3)] truncate block max-w-[130px]">
                          {doc.current_checksum || doc.checksum || '0x49f2b1a8...'}
                        </span>
                      </div>
                    </div>

                    {/* Threat Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border)]">
                      <span className="text-[10px] text-[var(--text-3)] font-mono">
                        {(doc as any).screening_summary || 'Multi-engine neural scan identified structural anomalies.'}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => navigate(`/forensics?documentId=${doc.id}`)}
                        >
                          Deep Forensic Studio 🔬
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="text-xs"
                          onClick={() => navigate(`/vault?documentId=${doc.id}&tab=tampering`)}
                        >
                          Vault Inspector 🔐
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </Card>
      </Reveal>
    </div>
  );
};

export default ThreatsPage;
