import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge, Card, Button, SectionHeader, cn } from '../../components/ui';
import { ThreatNode, SecurityRing } from '../../components/security';
import type { ThreatSeverity } from '../../types';

interface ThreatFeedItem {
  id: string;
  sourceDoc: string;
  vector: string;
  severity: ThreatSeverity;
  origin: string;
  timestamp: string;
  status: 'intercepted' | 'analyzing' | 'neutralized';
}

const INITIAL_FEED: ThreatFeedItem[] = [
  {
    id: 'TH-9021',
    sourceDoc: 'Acquisition_NDA_Final_v3.pdf',
    vector: 'Zero-Width Unicode Prompt Injection',
    severity: 'critical',
    origin: 'External Upload API',
    timestamp: 'Just now',
    status: 'intercepted',
  },
  {
    id: 'TH-9020',
    sourceDoc: 'Patient_Genomics_Report_COV992.docx',
    vector: 'HIPAA 18 Direct PHI Exposure',
    severity: 'critical',
    origin: 'S3 Sync Bucket EU-West-1',
    timestamp: '12s ago',
    status: 'neutralized',
  },
  {
    id: 'TH-9019',
    sourceDoc: 'infra-config-prod.ts',
    vector: 'Hardcoded PostgreSQL Root Credentials',
    severity: 'critical',
    origin: 'GitHub Webhook CI/CD',
    timestamp: '45s ago',
    status: 'neutralized',
  },
  {
    id: 'TH-9018',
    sourceDoc: 'Q3_Financial_Forecast.xlsx',
    vector: 'Unreleased Material Non-Public Information',
    severity: 'high',
    origin: 'Enterprise Web Portal',
    timestamp: '2m ago',
    status: 'neutralized',
  },
  {
    id: 'TH-9017',
    sourceDoc: 'Vendor_Contract_Amendments.pdf',
    vector: 'Steganographic Hidden Macro Payload',
    severity: 'high',
    origin: 'Email Gateway Attachment',
    timestamp: '4m ago',
    status: 'intercepted',
  },
  {
    id: 'TH-9016',
    sourceDoc: 'Customer_Support_Transcript.txt',
    vector: 'Payment Card CVV in Cleartext',
    severity: 'medium',
    origin: 'Zendesk Ingestion API',
    timestamp: '8m ago',
    status: 'neutralized',
  },
];

export const ThreatsPage: React.FC = () => {
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [feed, setFeed] = useState<ThreatFeedItem[]>(INITIAL_FEED);
  const [activeThreatNode, setActiveThreatNode] = useState<string>('injection');

  // Simulated live threat incoming stream
  useEffect(() => {
    const interval = setInterval(() => {
      const vectors = [
        { vector: 'Invisible Unicode Jailbreak Token', severity: 'critical' as const, doc: 'Supplier_Contract_2026.pdf' },
        { vector: 'Bearer Token Hardcoded in Config', severity: 'high' as const, doc: 'auth-service-env.yml' },
        { vector: 'Unsanitized Patient MRN Record', severity: 'medium' as const, doc: 'Clinic_Intake_048.docx' },
      ];
      const random = vectors[Math.floor(Math.random() * vectors.length)];
      const newThreat: ThreatFeedItem = {
        id: `TH-${Math.floor(1000 + Math.random() * 9000)}`,
        sourceDoc: random.doc,
        vector: random.vector,
        severity: random.severity,
        origin: 'Ingestion Pipeline Gateway',
        timestamp: 'Just now',
        status: 'intercepted',
      };
      setFeed((prev) => [newThreat, ...prev.slice(0, 11)]);
    }, 6000);

    return () => clearInterval(interval);
  }, []);

  const filteredFeed =
    selectedSeverity === 'all'
      ? feed
      : feed.filter((f) => f.severity === selectedSeverity);

  return (
    <div className="min-h-screen pt-14 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <SectionHeader
            eyebrow="Threat Intelligence Network"
            title="Live Threat Intelligence Map"
            description="Real-time global telemetry monitoring attack vectors, adversarial injections, and data exfiltration attempts across enterprise documents."
            className="mb-0"
          />

          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--threat)] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--threat)]" />
            </span>
            <span className="text-xs font-mono text-[var(--threat)] font-bold">LIVE TELEMETRY STREAM</span>
          </div>
        </div>

        {/* Global Metric Overview Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Critical Blocked', value: '48', status: 'threat', sub: 'Sub-second neural drop' },
            { label: 'High Risk Filtered', value: '142', status: 'warning', sub: 'Deterministic redactions' },
            { label: 'Active Ingestion Nodes', value: '1,840', status: 'safe', sub: 'TEE Hardware enclaves' },
            { label: 'Interception Latency', value: '1.2ms', status: 'info', sub: 'Global edge network' },
          ].map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-4">
                <div className="text-[10px] font-mono uppercase text-[var(--text-3)] mb-1">{m.label}</div>
                <div
                  className="text-2xl font-bold font-mono"
                  style={{
                    color:
                      m.status === 'threat'
                        ? 'var(--threat)'
                        : m.status === 'warning'
                        ? '#F97316'
                        : m.status === 'safe'
                        ? 'var(--safe)'
                        : 'var(--accent)',
                  }}
                >
                  {m.value}
                </div>
                <div className="text-[10px] text-[var(--text-2)] mt-0.5">{m.sub}</div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Main Grid: Threat Topology Network + Live Stream Feed */}
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Interactive Threat Topology Visualizer */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="p-6 relative overflow-hidden min-h-[420px] flex flex-col justify-between">
              {/* Technical Grid Overlay */}
              <div className="absolute inset-0 tech-grid-dense opacity-20 pointer-events-none" />

              <div>
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <div>
                    <span className="text-xs font-mono font-bold uppercase text-[var(--accent)] block">
                      Attack Vector Topology
                    </span>
                    <span className="text-sm font-semibold text-[var(--text-1)]">
                      Active Threat Correlation Graph
                    </span>
                  </div>
                  <Badge variant="threat" size="sm" dot>
                    Active Interceptions
                  </Badge>
                </div>

                {/* Interactive Node Graph Map */}
                <div className="relative h-64 border border-[var(--border)] rounded-xl bg-[var(--surface-alt)] p-4 flex items-center justify-center">
                  {/* Central Ingestion Core */}
                  <div className="absolute z-20 flex flex-col items-center">
                    <motion.div
                      animate={{ scale: [1, 1.08, 1], boxShadow: ['0 0 10px rgba(0,184,169,0.2)', '0 0 24px rgba(0,184,169,0.5)', '0 0 10px rgba(0,184,169,0.2)'] }}
                      transition={{ duration: 3, repeat: Infinity }}
                      className="w-14 h-14 rounded-full border-2 border-[var(--accent)] bg-[var(--bg)] flex items-center justify-center text-[var(--accent)]"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </motion.div>
                    <span className="text-[10px] font-mono font-bold text-[var(--text-1)] mt-1.5">
                      DOCSHIELD CORE
                    </span>
                  </div>

                  {/* Satellite Threat Nodes */}
                  <div className="absolute top-6 left-8">
                    <ThreatNode
                      severity="critical"
                      label="Prompt Injections"
                      count={18}
                      active={activeThreatNode === 'injection'}
                      onClick={() => setActiveThreatNode('injection')}
                    />
                  </div>

                  <div className="absolute top-6 right-8">
                    <ThreatNode
                      severity="critical"
                      label="PHI/PII Exfiltration"
                      count={24}
                      active={activeThreatNode === 'pii'}
                      onClick={() => setActiveThreatNode('pii')}
                    />
                  </div>

                  <div className="absolute bottom-6 left-8">
                    <ThreatNode
                      severity="high"
                      label="Secret Leakage"
                      count={9}
                      active={activeThreatNode === 'secrets'}
                      onClick={() => setActiveThreatNode('secrets')}
                    />
                  </div>

                  <div className="absolute bottom-6 right-8">
                    <ThreatNode
                      severity="medium"
                      label="Fraudulent Signatures"
                      count={6}
                      active={activeThreatNode === 'fraud'}
                      onClick={() => setActiveThreatNode('fraud')}
                    />
                  </div>

                  {/* SVG Connecting circuit lines */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-[var(--border-accent)] opacity-40">
                    <line x1="25%" y1="20%" x2="50%" y2="50%" strokeDasharray="4 4" className="animate-data-flow" />
                    <line x1="75%" y1="20%" x2="50%" y2="50%" strokeDasharray="4 4" className="animate-data-flow" />
                    <line x1="25%" y1="80%" x2="50%" y2="50%" strokeDasharray="4 4" className="animate-data-flow" />
                    <line x1="75%" y1="80%" x2="50%" y2="50%" strokeDasharray="4 4" className="animate-data-flow" />
                  </svg>
                </div>
              </div>

              {/* Node description footer */}
              <div className="mt-4 p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-xs text-[var(--text-2)] flex items-center justify-between">
                <span>
                  {activeThreatNode === 'injection'
                    ? 'Adversarial Prompt Injections: Intercepts zero-width unicode, recursive system-prompt escapes, and LLM jailbreaks.'
                    : activeThreatNode === 'pii'
                    ? 'Sensitive Data Exfiltration: Detects and replaces SSNs, HIPAA medical records, and passport IDs.'
                    : activeThreatNode === 'secrets'
                    ? 'Hardcoded Production Secrets: Revokes exposed API keys, private RSA keys, and database passwords.'
                    : 'Fraudulent Document Alteration: Flags forged signatures, modified financial tables, and metadata tampering.'}
                </span>
                <Button variant="outline" size="sm" className="ml-3 flex-shrink-0">
                  Inspect Rules
                </Button>
              </div>
            </Card>
          </div>

          {/* Live Intercepted Feed Stream */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3 border-b border-[var(--border)] pb-3">
                <div>
                  <span className="text-xs font-mono font-bold uppercase text-[var(--text-1)] block">
                    Interception Feed
                  </span>
                  <span className="text-[10px] text-[var(--text-3)]">Real-time gateway events</span>
                </div>

                {/* Filter buttons */}
                <div className="flex items-center gap-1">
                  {(['all', 'critical', 'high'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSelectedSeverity(s)}
                      className={cn(
                        'px-2 py-0.5 text-[10px] font-mono rounded capitalize transition-colors',
                        selectedSeverity === s
                          ? 'bg-[var(--accent)] text-[#0D1117] font-bold'
                          : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stream List */}
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {filteredFeed.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] hover:border-[var(--border-accent)] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse"
                            style={{
                              backgroundColor:
                                item.severity === 'critical'
                                  ? 'var(--threat)'
                                  : item.severity === 'high'
                                  ? '#F97316'
                                  : 'var(--warning)',
                            }}
                          />
                          <span className="text-xs font-bold text-[var(--text-1)] truncate max-w-[180px]">
                            {item.vector}
                          </span>
                        </div>
                        <span className="text-[9px] font-mono text-[var(--text-3)]">{item.timestamp}</span>
                      </div>

                      <div className="text-[11px] font-mono text-[var(--text-2)] truncate mb-1.5">
                        Doc: {item.sourceDoc}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)]">
                        <span>{item.origin}</span>
                        <span
                          className={cn(
                            'font-bold px-1.5 py-0.2 rounded uppercase text-[9px]',
                            item.status === 'neutralized'
                              ? 'bg-[#22C55E]/15 text-[#22C55E]'
                              : 'bg-[#EF4444]/15 text-[#EF4444]'
                          )}
                        >
                          {item.status}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThreatsPage;
