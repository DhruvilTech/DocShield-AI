import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge, Card, SectionHeader, Button, cn, CountUp, Reveal } from '../../components/ui';
import { SecurityRing, VerificationAnimation } from '../../components/security';
import { SECURITY_CONTROLS } from '../../lib/data';

const statusMeta = {
  passing: { label: 'Passing', variant: 'safe'    as const },
  failing: { label: 'Failing', variant: 'threat'  as const },
  partial: { label: 'Partial', variant: 'warning' as const },
  na:      { label: 'N/A',     variant: 'neutral' as const },
};

const CATEGORIES = ['All', ...new Set(SECURITY_CONTROLS.map(c => c.category))];
const STANDARDS = ['All Standards', 'SOC 2', 'HIPAA', 'GDPR', 'OWASP', 'ISO 27001', 'FIPS 140-3'];

export const SecurityPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStandard, setSelectedStandard] = useState<string>('All Standards');
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [auditProgress, setAuditProgress] = useState<number>(100);

  const handleRunAudit = () => {
    setIsAuditing(true);
    setAuditProgress(0);
    const interval = setInterval(() => {
      setAuditProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsAuditing(false);
          return 100;
        }
        return prev + 15;
      });
    }, 250);
  };

  const filteredControls = SECURITY_CONTROLS.filter(c => {
    const matchCat = selectedCategory === 'All' || c.category === selectedCategory;
    const matchStd = selectedStandard === 'All Standards' || c.standard.includes(selectedStandard);
    return matchCat && matchStd;
  });

  const passing = SECURITY_CONTROLS.filter(c => c.status === 'passing').length;
  const partial = SECURITY_CONTROLS.filter(c => c.status === 'partial').length;
  const score   = Math.round((passing / SECURITY_CONTROLS.length) * 100);

  return (
    <div className="min-h-screen pt-14 bg-transparent">
      <Reveal className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <SectionHeader
            eyebrow="Security Control Matrix"
            title="Compliance & Control Posture"
            description="Continuous automated verification against SOC 2 Type II, HIPAA Security Rule, GDPR Art. 9, and OWASP LLM Top 10 standards."
            className="mb-0"
          />

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              loading={isAuditing}
              onClick={handleRunAudit}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isAuditing ? `Auditing (${auditProgress}%)…` : 'Run Continuous Audit'}
            </Button>
          </div>
        </div>

        {/* Global Compliance Scorecards */}
        <div className="grid sm:grid-cols-4 gap-4 mb-8">
          <Card className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block mb-1">Overall Posture</span>
              <div className="text-2xl font-bold font-mono text-[var(--safe)]"><CountUp value={score} />%</div>
              <span className="text-[11px] text-[var(--safe)]">Grade A+ Certified</span>
            </div>
            <SecurityRing progress={auditProgress === 100 ? score : auditProgress} status={isAuditing ? 'scanning' : 'verified'} size={56} strokeWidth={3} />
          </Card>

          <Card className="p-4 text-center">
            <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block mb-1">Passing Controls</span>
            <div className="text-2xl font-bold font-mono text-[var(--safe)] mb-0.5"><CountUp value={passing} />/{SECURITY_CONTROLS.length}</div>
            <span className="text-[11px] text-[var(--text-2)]">Zero critical failures</span>
          </Card>

          <Card className="p-4 text-center">
            <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block mb-1">Partially Passing</span>
            <div className="text-2xl font-bold font-mono text-[var(--warning)] mb-0.5"><CountUp value={partial} /></div>
            <span className="text-[11px] text-[var(--text-2)]">EU Residency config in review</span>
          </Card>

          <Card className="p-4 text-center">
            <span className="text-[10px] font-mono text-[var(--text-3)] uppercase block mb-1">Audit Ledger</span>
            <div className="text-sm font-bold font-mono text-[var(--accent)] mb-0.5">Aug 27, 2026</div>
            <span className="text-[11px] text-[var(--text-3)]">Merkle Hash: 0x9f4a...8c21</span>
          </Card>
        </div>

        {/* Filtering Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 border-b border-[var(--border)] pb-4">
          {/* Category Chips */}
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  'px-3 py-1 text-xs font-mono rounded-lg transition-colors duration-150',
                  selectedCategory === cat
                    ? 'bg-[var(--accent)] text-[#0D1117] font-bold'
                    : 'text-[var(--text-2)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-1)] border border-[var(--border)]'
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Standard Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[var(--text-3)]">Standard:</span>
            <select
              value={selectedStandard}
              onChange={(e) => setSelectedStandard(e.target.value)}
              className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg px-2.5 py-1 text-xs font-mono text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)]"
            >
              {STANDARDS.map(s => (
                <option key={s} value={s} className="bg-[var(--surface)] text-[var(--text-1)]">{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Controls List */}
        <div className="space-y-3 mb-8">
          <AnimatePresence>
            {filteredControls.map((ctrl, i) => {
              const meta = isAuditing && auditProgress < 100
                ? { label: 'Scanning…', variant: 'neutral' as const }
                : statusMeta[ctrl.status];

              return (
                <motion.div
                  key={ctrl.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Card className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className={cn(
                        'w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0',
                        isAuditing ? 'bg-[var(--accent)] animate-ping' :
                        ctrl.status === 'passing' ? 'bg-[var(--safe)] shadow-[0_0_8px_rgba(34,197,94,0.4)]' :
                        ctrl.status === 'partial' ? 'bg-[var(--warning)]' : 'bg-[var(--threat)]'
                      )} />

                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-semibold text-[var(--text-1)]">{ctrl.name}</span>
                          <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
                          <span className="text-[10px] font-mono text-[var(--text-3)] bg-[var(--surface-alt)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                            {ctrl.standard}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-2)] leading-relaxed">{ctrl.description}</p>
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-right font-mono text-[10px] text-[var(--text-3)] hidden sm:block">
                      <span className="text-[var(--accent)] block font-bold">VERIFIED TEE ENCLAVE</span>
                      <span>Merkle Leaf #{ctrl.id.split('-')[1]}</span>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Verifiable Seal Banner */}
        <VerificationAnimation
          score={99.9}
          label="SOC 2 Type II & HIPAA Continuous Compliance Attestation Active"
          className="w-full"
        />
      </Reveal>
    </div>
  );
};

export default SecurityPage;
