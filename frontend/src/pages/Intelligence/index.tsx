import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge, Card, SectionHeader, Metric, Button, cn } from '../../components/ui';
import { SecurityRing, ScanLine } from '../../components/security';

interface SecurityEngine {
  id: string;
  name: string;
  category: string;
  status: 'Active' | 'Optimizing' | 'Syncing';
  accuracy: string;
  threats: number;
  color: string;
  description: string;
  parameters: string;
  latency: string;
}

const ENGINES: SecurityEngine[] = [
  {
    id: 'eng-pii',
    name: 'PII Sentinel',
    category: 'Privacy & Tokenization',
    status: 'Active',
    accuracy: '99.8%',
    threats: 142,
    color: 'var(--info)',
    description: 'Neural entity recognition parsing 140+ international PII formats with deterministic token replacement.',
    parameters: '1.4B weights · RoBERTa-Security-XL',
    latency: '1.8ms',
  },
  {
    id: 'eng-inj',
    name: 'Injection Guard',
    category: 'Adversarial AI Defense',
    status: 'Active',
    accuracy: '97.6%',
    threats: 88,
    color: 'var(--ai)',
    description: 'Intercepts multi-turn prompt injections, invisible zero-width unicode, and semantic jailbreak payloads.',
    parameters: '3.8B weights · LLM-Defense-Matrix',
    latency: '3.4ms',
  },
  {
    id: 'eng-fraud',
    name: 'Fraud Detector',
    category: 'Document Authenticity',
    status: 'Active',
    accuracy: '98.4%',
    threats: 34,
    color: 'var(--warning)',
    description: 'Visual artifact analysis detecting forged signature tensors, spliced font tables, and field modifications.',
    parameters: '850M weights · Vision-Transformer-Forensics',
    latency: '4.2ms',
  },
  {
    id: 'eng-sec',
    name: 'Secret Scanner',
    category: 'Credentials & Keys',
    status: 'Active',
    accuracy: '99.9%',
    threats: 64,
    color: 'var(--threat)',
    description: 'High-entropy algorithmic inspection for raw RSA private keys, AWS/GCP tokens, and DB connection strings.',
    parameters: 'Regex-Automata + Shannon-Entropy',
    latency: '0.6ms',
  },
  {
    id: 'eng-watermark',
    name: 'Forensic Marker',
    category: 'Provenance & Tracking',
    status: 'Active',
    accuracy: '100%',
    threats: 12,
    color: 'var(--accent)',
    description: 'Embeds recipient-bound steganographic watermarks surviving OCR, print-scan cycles, and screenshot attacks.',
    parameters: 'Steganographic DCT Spectral Embedding',
    latency: '2.1ms',
  },
  {
    id: 'eng-comp',
    name: 'Compliance Auditor',
    category: 'Regulatory Mapping',
    status: 'Active',
    accuracy: '96.8%',
    threats: 28,
    color: 'var(--safe)',
    description: 'Automated policy validator generating immutable Merkle proofs for SOC 2, HIPAA, and GDPR frameworks.',
    parameters: 'Formal Logic Rule Engine + Cryptographic Hasher',
    latency: '1.1ms',
  },
];

export const IntelligencePage: React.FC = () => {
  const [selectedEngineId, setSelectedEngineId] = useState<string>('eng-inj');
  const [activeTab, setActiveTab] = useState<'topology' | 'telemetry'>('topology');

  const selectedEngine = ENGINES.find((e) => e.id === selectedEngineId) || ENGINES[0];

  return (
    <div className="min-h-screen pt-14 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <SectionHeader
            eyebrow="AI Neural Security Core"
            title="Parallel Security Intelligence Engines"
            description="Six specialized deep-learning models run simultaneously in hardware-isolated TEE memory to identify attacks across every document layer."
            className="mb-0"
          />

          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--safe)] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--safe)]" />
            </span>
            <span className="text-xs font-mono text-[var(--safe)] font-bold">ALL 6 ENGINES SYNCHRONIZED</span>
          </div>
        </div>

        {/* Global Performance Telemetry Metrics */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Scans Processed', value: '4,281', description: '+18% vs yesterday', status: 'info' as const },
            { label: 'Neural Threat Neutralizations', value: '368', description: 'Zero false escapes', status: 'threat' as const },
            { label: 'Mean Inference Latency', value: '2.2ms', description: 'Intel SGX TEE optimized', status: 'safe' as const },
            { label: 'Aggregate Model Accuracy', value: '99.94%', description: 'Trained on 40M+ documents', status: 'safe' as const },
          ].map((m, i) => (
            <motion.div key={m.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Metric {...m} />
            </motion.div>
          ))}
        </div>

        {/* Neural Hub Interactive Topology + Engine Details */}
        <div className="grid lg:grid-cols-12 gap-6 mb-8">
          {/* Left Column: Interactive 6-Engine Neural Grid */}
          <div className="lg:col-span-8 space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {ENGINES.map((engine) => {
                const isSelected = engine.id === selectedEngineId;
                return (
                  <motion.div
                    key={engine.id}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedEngineId(engine.id)}
                    className="cursor-pointer"
                  >
                    <Card
                      className={cn(
                        'p-4 h-full relative overflow-hidden transition-all duration-200',
                        isSelected
                          ? 'border-[var(--border-accent)] bg-[var(--surface-alt)] shadow-[var(--shadow-md)]'
                          : 'hover:border-[var(--border-strong)]'
                      )}
                    >
                      {isSelected && (
                        <div
                          className="absolute top-0 left-0 right-0 h-0.5"
                          style={{ backgroundColor: engine.color }}
                        />
                      )}

                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-sm font-bold text-[var(--text-1)]">{engine.name}</h3>
                          <span className="text-[10px] font-mono text-[var(--text-3)]">{engine.category}</span>
                        </div>
                        <Badge variant="safe" size="sm" dot>
                          {engine.status}
                        </Badge>
                      </div>

                      <p className="text-xs text-[var(--text-2)] line-clamp-2 leading-relaxed mb-3">
                        {engine.description}
                      </p>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border)] text-[10px] font-mono">
                        <div>
                          <span className="text-[var(--text-3)] block">Accuracy</span>
                          <span className="text-xs font-bold font-mono" style={{ color: engine.color }}>
                            {engine.accuracy}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--text-3)] block">Detections</span>
                          <span className="text-xs font-bold font-mono text-[var(--text-1)]">
                            {engine.threats}k
                          </span>
                        </div>
                      </div>

                      {/* Accuracy bar */}
                      <div className="mt-2.5 h-1 rounded-full bg-[var(--surface-raised)] overflow-hidden">
                        <div className="h-full rounded-full" style={{ backgroundColor: engine.color, width: engine.accuracy }} />
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Engine Deep Dive & Tensor Inspector */}
          <div className="lg:col-span-4">
            <Card className="p-5 border-[var(--border-accent)] h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-3">
                  <div>
                    <span className="text-xs font-mono font-bold uppercase text-[var(--accent)] block">
                      Engine Diagnostics
                    </span>
                    <span className="text-base font-bold text-[var(--text-1)]">{selectedEngine.name}</span>
                  </div>
                  <SecurityRing
                    progress={parseFloat(selectedEngine.accuracy)}
                    status="verified"
                    size={52}
                    strokeWidth={3}
                  />
                </div>

                <div className="space-y-3 text-xs font-mono mb-5">
                  <div className="p-2.5 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-3)] block uppercase mb-0.5">Model Architecture</span>
                    <span className="text-[var(--text-1)] font-semibold">{selectedEngine.parameters}</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-3)] block uppercase mb-0.5">Inference SLA</span>
                    <span className="text-[var(--safe)] font-semibold">{selectedEngine.latency} (Sub-second guarantee)</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-3)] block uppercase mb-0.5">Neural Interception Scope</span>
                    <p className="text-[var(--text-2)] text-[11px] leading-relaxed font-sans mt-1">
                      {selectedEngine.description}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border)] flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  Adjust Thresholds
                </Button>
                <Button variant="primary" size="sm">
                  Run Diagnostics
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntelligencePage;
