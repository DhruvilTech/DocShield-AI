import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Badge, Card, Button, SectionHeader, cn } from '../../components/ui';
import { SecurityRing, VerificationAnimation } from '../../components/security';

export const ReportsPage: React.FC = () => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => setDownloading(false), 2000);
  };

  return (
    <div className="min-h-screen pt-14 bg-transparent">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <SectionHeader
            eyebrow="Security Intelligence Dossier"
            title="Executive Threat & Compliance Report"
            description="Cryptographically verifiable compliance, risk scores, and threat neutralization telemetry for SOC 2, HIPAA, and GDPR auditors."
            className="mb-0"
          />

          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm" loading={downloading} onClick={handleDownload}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Audit PDF
            </Button>
          </div>
        </div>

        {/* Verifiable Seal Banner */}
        <div className="mb-8">
          <VerificationAnimation
            score={99.94}
            label="Cryptographic Security Audit Passed — Zero Unmitigated Breaches"
            className="w-full"
          />
        </div>

        {/* Executive Scorecards */}
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <Card className="p-5 flex items-center justify-between">
            <div>
              <span className="text-xs font-mono text-[var(--text-3)] uppercase block mb-1">
                Total Estate Risk Score
              </span>
              <div className="text-3xl font-bold font-mono text-[var(--safe)]">
                04<span className="text-sm text-[var(--text-3)]">/100</span>
              </div>
              <span className="text-xs text-[var(--safe)]">Minimal Risk (Grade A+)</span>
            </div>
            <SecurityRing progress={96} status="verified" size={68} strokeWidth={4} />
          </Card>

          <Card className="p-5 flex items-center justify-between">
            <div>
              <span className="text-xs font-mono text-[var(--text-3)] uppercase block mb-1">
                Compliance Alignment
              </span>
              <div className="text-3xl font-bold font-mono text-[var(--accent)]">98.5%</div>
              <span className="text-xs text-[var(--text-2)]">SOC2, HIPAA, GDPR Ready</span>
            </div>
            <SecurityRing progress={98.5} status="verified" size={68} strokeWidth={4} />
          </Card>

          <Card className="p-5 flex items-center justify-between">
            <div>
              <span className="text-xs font-mono text-[var(--text-3)] uppercase block mb-1">
                Threat Neutralization Rate
              </span>
              <div className="text-3xl font-bold font-mono text-[var(--accent-blue)]">100%</div>
              <span className="text-xs text-[var(--text-2)]">All 422 vectors dropped</span>
            </div>
            <SecurityRing progress={100} status="verified" size={68} strokeWidth={4} />
          </Card>
        </div>

        {/* Breakdown by Threat Category */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-[var(--text-1)] mb-4">
              Threat Distribution by Vector (Last 30 Days)
            </h3>
            <div className="space-y-3 font-mono text-xs">
              {[
                { name: 'PII & PHI Cleartext Data', count: 184, percent: 43, color: 'var(--info)' },
                { name: 'Adversarial Prompt Injections', count: 96, percent: 23, color: 'var(--ai)' },
                { name: 'Exposed Credentials & API Keys', count: 72, percent: 17, color: 'var(--threat)' },
                { name: 'Altered Signatures & Document Fraud', count: 48, percent: 11, color: 'var(--warning)' },
                { name: 'Unlicensed IP Disclosures', count: 22, percent: 6, color: 'var(--accent)' },
              ].map((item) => (
                <div key={item.name} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--text-2)]">{item.name}</span>
                    <span className="text-[var(--text-1)] font-bold">{item.count} ({item.percent}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--surface-raised)] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${item.percent}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-[var(--text-1)] mb-4">
              Compliance Standard Readiness
            </h3>
            <div className="space-y-3 font-mono text-xs">
              {[
                { framework: 'SOC 2 Type II (Trust Services Criteria)', score: 100, status: 'Audit Ready' },
                { framework: 'HIPAA Security & Privacy Rule (18 PHI Safe Harbor)', score: 98, status: 'Compliant' },
                { framework: 'GDPR (Article 9 Special Category Data)', score: 96, status: 'Compliant' },
                { framework: 'OWASP LLM Top 10 Security Standard', score: 100, status: 'Protected' },
                { framework: 'ISO/IEC 27001 Information Security', score: 94, status: 'Compliant' },
              ].map((std) => (
                <div key={std.framework} className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-bold text-[var(--text-1)]">{std.framework}</div>
                    <span className="text-[10px] text-[var(--safe)]">{std.status}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold font-mono text-[var(--accent)]">{std.score}%</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Audit Trail Ledger */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3 border-b border-[var(--border)] pb-3">
            <div>
              <span className="text-xs font-mono font-bold uppercase text-[var(--text-1)] block">
                Immutable Ledger Signatures
              </span>
              <span className="text-[10px] text-[var(--text-3)]">Merkle root timestamped records</span>
            </div>
            <Badge variant="safe" size="sm">Valid Proofs</Badge>
          </div>

          <div className="font-mono text-xs space-y-2 text-[var(--text-2)]">
            {[
              { time: '2026-08-27 09:14:22 UTC', root: '0x8f2a1c9e4b7d3f0a...', op: 'REDACT_PII_SUCCESS', hash: 'sha256:8f2a1c...' },
              { time: '2026-08-27 08:31:05 UTC', root: '0x3c7e1b9f5d2a8e4c...', op: 'INJECTION_NEUTRALIZED', hash: 'sha256:3c7e1b...' },
              { time: '2026-08-27 07:45:11 UTC', root: '0x1b92f4d8c3a6e0b5...', op: 'WATERMARK_EMBEDDED', hash: 'sha256:1b92f4...' },
            ].map((entry, idx) => (
              <div key={idx} className="p-2 rounded bg-[var(--surface-alt)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-2 text-[10px]">
                <span className="text-[var(--text-3)]">{entry.time}</span>
                <span className="text-[var(--accent)] font-bold">{entry.op}</span>
                <span className="text-[var(--text-2)]">{entry.root}</span>
                <span className="text-[var(--safe)]">MERKLE_CONFIRMED</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ReportsPage;
