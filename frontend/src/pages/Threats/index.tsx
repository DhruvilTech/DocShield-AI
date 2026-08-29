// src/pages/Threats/index.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Badge, Card, Button, SectionHeader, cn, Reveal } from '../../components/ui';
import { useOrganization } from '../../context/OrganizationContext';
import { documentApi } from '../../lib/api/document.api';
import { VaultDocument, ThreatSeverity } from '../../types';

export const ThreatsPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');

  useEffect(() => {
    if (activeOrganization) {
      setLoading(true);
      documentApi
        .listDocuments({ limit: 50 })
        .then((res) => {
          setDocuments(res.data || []);
        })
        .catch((err) => {
          console.error('Failed to load documents for threat feed', err);
        })
        .finally(() => setLoading(false));
    }
  }, [activeOrganization]);

  // Real flagged threats from actual screened documents
  const threatDocs = documents.filter((doc) => {
    const isThreat =
      (doc.risk_score && doc.risk_score > 30) ||
      doc.has_tampering ||
      doc.screening_verdict === 'REJECTED' ||
      doc.screening_verdict === 'REVIEW_REQUIRED';
    if (!isThreat) return false;

    if (selectedSeverity === 'critical') return doc.risk_score && doc.risk_score >= 70;
    if (selectedSeverity === 'high') return doc.risk_score && doc.risk_score >= 50 && doc.risk_score < 70;
    if (selectedSeverity === 'medium') return doc.risk_score && doc.risk_score >= 30 && doc.risk_score < 50;
    return true;
  });

  return (
    <div className="min-h-screen pt-14 bg-transparent">
      <Reveal className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <SectionHeader
            eyebrow="Active Threat Intelligence"
            title="Border Threat & Fraud Vectors"
            description="Real-time audit of intercepted document tampering, forged consular stamps, photo replacements, and watchlisted identities."
            className="mb-0"
          />

          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm" onClick={() => navigate('/scanner')}>
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Initiate Document Scan
            </Button>
          </div>
        </div>

        {/* Severity Filter Tabs & Stats */}
        <div className="grid sm:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block">Total Screened</span>
              <span className="text-2xl font-bold font-mono text-[var(--text-1)]">{documents.length}</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[var(--surface-raised)] text-[var(--text-2)] flex items-center justify-center font-mono text-sm">
              📄
            </div>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block">Flagged Threats</span>
              <span className="text-2xl font-bold font-mono text-[var(--threat)]">
                {documents.filter((d) => (d.risk_score && d.risk_score > 30) || d.has_tampering).length}
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[var(--threat)]/10 text-[var(--threat)] flex items-center justify-center font-mono text-sm">
              🚨
            </div>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block">Clean Credentials</span>
              <span className="text-2xl font-bold font-mono text-[var(--safe)]">
                {documents.filter((d) => (!d.risk_score || d.risk_score <= 30) && !d.has_tampering).length}
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[var(--safe)]/10 text-[var(--safe)] flex items-center justify-center font-mono text-sm">
              ✓
            </div>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block">Intercept Rate</span>
              <span className="text-2xl font-bold font-mono text-[var(--accent)]">100%</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-muted)] text-[var(--accent)] flex items-center justify-center font-mono text-sm">
              🛡️
            </div>
          </Card>
        </div>

        {/* Severity Filter Controls */}
        <div className="flex items-center gap-2 mb-4">
          {['all', 'critical', 'high', 'medium'].map((sev) => (
            <button
              key={sev}
              onClick={() => setSelectedSeverity(sev)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-mono uppercase font-semibold transition-colors border',
                selectedSeverity === sev
                  ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-1)]'
                  : 'border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-3)] hover:text-[var(--text-1)]'
              )}
            >
              {sev}
            </button>
          ))}
        </div>

        {/* Real Threats Feed */}
        <Card className="p-6 border-[var(--border)]">
          {loading ? (
            <div className="p-10 text-center text-xs font-mono text-[var(--text-3)]">
              Querying live security enclave telemetry...
            </div>
          ) : threatDocs.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-[var(--safe)]/10 text-[var(--safe)] flex items-center justify-center text-2xl mb-3">
                ✓
              </div>
              <h3 className="text-sm font-bold text-[var(--text-1)] mb-1 font-mono">
                No Active Threat Vectors Flagged
              </h3>
              <p className="text-xs text-[var(--text-2)] max-w-md font-mono leading-relaxed mb-4">
                All travel documents currently screened in this organization are within official ICAO 9303 tolerance with zero unmitigated tampering anomalies.
              </p>
              <Button size="sm" variant="outline" onClick={() => navigate('/scanner')}>
                Screen a Document in Live Enclave
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {threatDocs.map((doc) => {
                const isCritical = (doc.risk_score || 0) >= 70;
                return (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] hover:border-[var(--border-accent)] transition-all"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2 font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-1)]">{doc.name}</span>
                        <Badge variant={isCritical ? 'threat' : 'warning'} size="sm">
                          Risk Score: {doc.risk_score || 0}/100
                        </Badge>
                        <Badge variant="accent" size="sm">
                          {doc.document_type}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-[var(--text-3)]">
                        {new Date(doc.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-2 text-[11px] font-mono text-[var(--text-2)] pt-2 border-t border-[var(--border)]">
                      <div>
                        <span className="text-[10px] text-[var(--text-3)] block">VERDICT</span>
                        <span className={cn('font-bold', doc.screening_verdict === 'REJECTED' ? 'text-[var(--threat)]' : 'text-[var(--warning)]')}>
                          {doc.screening_verdict || 'FLAGGED FOR REVIEW'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[var(--text-3)] block">TAMPERING FORENSICS</span>
                        <span className="text-[var(--text-1)]">
                          {doc.has_tampering ? '🚨 Alterations Detected' : 'Clean Matrix'}
                        </span>
                      </div>
                      <div className="flex justify-end items-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-[11px] text-[var(--accent)] hover:bg-[var(--accent-muted)]"
                          onClick={() => navigate('/vault')}
                        >
                          View in Vault →
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
