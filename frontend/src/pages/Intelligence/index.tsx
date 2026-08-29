// src/pages/Intelligence/index.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Badge, Card, SectionHeader, Button, cn, Reveal } from '../../components/ui';
import { SecurityRing, ScanLine } from '../../components/security';

interface SecurityEngine {
  id: string;
  name: string;
  category: string;
  status: 'Active' | 'Optimizing' | 'Syncing';
  accuracy: string;
  color: string;
  description: string;
  parameters: string;
  latency: string;
}

const P8_SECURITY_ENGINES: SecurityEngine[] = [
  {
    id: 'mod-1',
    name: 'Module 1: OCR & MRZ Parser',
    category: 'Credential Decompilation',
    status: 'Active',
    accuracy: '99.4%',
    color: 'var(--accent)',
    description: 'Decompiles Type 1, 2, and 3 ICAO Doc 9303 Machine Readable Zones (MRZ), Passports, Visas, and Border Permits.',
    parameters: '7-3-1 ICAO Matrix · Regex Automata',
    latency: '1.2ms',
  },
  {
    id: 'mod-2',
    name: 'Module 2: Validation & Watchlists',
    category: 'Interpol SLTD & Checksums',
    status: 'Active',
    accuracy: '100%',
    color: 'var(--safe)',
    description: 'Calculates ICAO 9303 check digit consistency, 6-month international travel validity, and matches Interpol SLTD alert database.',
    parameters: 'Interpol SLTD · Stolen Passport Registry',
    latency: '0.8ms',
  },
  {
    id: 'mod-3',
    name: 'Module 3: Tampering Forensics',
    category: 'Forensic Alteration AI',
    status: 'Active',
    accuracy: '98.8%',
    color: 'var(--threat)',
    description: 'Detects photo boundary replacement, text manipulation/font inconsistency, forged consular visa stamps, and EXIF editing tags.',
    parameters: 'Tamper-Guard-v2 · Quantization Spectrum',
    latency: '3.1ms',
  },
  {
    id: 'mod-4',
    name: 'Module 4: Biometric Face Matcher',
    category: 'Identity Verification',
    status: 'Active',
    accuracy: '99.1%',
    color: 'var(--info)',
    description: 'Compares document portrait photographs against live subject camera capture with facial landmark & illumination compensation.',
    parameters: 'Biometric Cosine Similarity · 75% Threshold',
    latency: '2.4ms',
  },
];

export const IntelligencePage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedEngineId, setSelectedEngineId] = useState<string>('mod-1');
  const selectedEngine = P8_SECURITY_ENGINES.find((e) => e.id === selectedEngineId) || P8_SECURITY_ENGINES[0];

  return (
    <div className="min-h-screen pt-14 bg-transparent">
      <Reveal className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <SectionHeader
            eyebrow="Intelligence Architecture"
            title="Border Screening Neural & Forensic Stack"
            description="Four integrated security engines powering instantaneous credential validation and fake identity detection."
            className="mb-0"
          />

          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm" onClick={() => navigate('/scanner')}>
              Open Scanner Enclave
            </Button>
          </div>
        </div>

        {/* 4 Modules Grid */}
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left: Engine Selection */}
          <div className="lg:col-span-5 space-y-3">
            {P8_SECURITY_ENGINES.map((eng) => {
              const isSelected = eng.id === selectedEngineId;
              return (
                <Card
                  key={eng.id}
                  onClick={() => setSelectedEngineId(eng.id)}
                  className={cn(
                    'p-4 cursor-pointer transition-all border font-mono text-xs',
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--surface-alt)] shadow-[var(--shadow-md)]'
                      : 'border-[var(--border)] bg-[var(--surface-raised)] hover:border-[var(--border-accent)]'
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-[var(--text-1)]">{eng.name}</span>
                    <Badge variant="safe" size="sm">{eng.status}</Badge>
                  </div>
                  <p className="text-[11px] text-[var(--text-2)] font-sans mb-2 leading-relaxed">{eng.description}</p>
                  <div className="flex items-center justify-between text-[10px] text-[var(--text-3)] pt-2 border-t border-[var(--border)]">
                    <span>{eng.category}</span>
                    <span className="text-[var(--accent)]">Accuracy: {eng.accuracy}</span>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Right: Selected Engine Deep Telemetry */}
          <div className="lg:col-span-7">
            <Card className="p-6 border-[var(--border)] relative overflow-hidden bg-black/40 min-h-[420px]">
              <ScanLine />

              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-6">
                <div>
                  <h3 className="text-base font-bold font-mono text-[var(--text-1)]">{selectedEngine.name}</h3>
                  <span className="text-xs text-[var(--text-3)] font-mono">{selectedEngine.category}</span>
                </div>
                <Badge variant="safe" size="sm">Operational · {selectedEngine.latency}</Badge>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)]">
                  <span className="text-[10px] font-mono uppercase text-[var(--text-3)] block mb-1">Architecture</span>
                  <span className="text-xs font-mono font-bold text-[var(--text-1)]">{selectedEngine.parameters}</span>
                </div>
                <div className="p-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)]">
                  <span className="text-[10px] font-mono uppercase text-[var(--text-3)] block mb-1">Execution Speed</span>
                  <span className="text-xs font-mono font-bold text-[var(--safe)]">{selectedEngine.latency} per document</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] mb-6 text-xs font-mono space-y-2">
                <span className="text-[10px] uppercase font-bold text-[var(--text-3)] block">Functional Directives:</span>
                <p className="text-[var(--text-2)] font-sans leading-relaxed">
                  {selectedEngine.description} Executes within Hardware-Isolated TEE memory space with zero plaintext persistent leaks.
                </p>
              </div>

              <Button
                variant="primary"
                className="w-full"
                onClick={() => navigate('/scanner')}
              >
                Launch Verification in Checkpoint Scanner
              </Button>
            </Card>
          </div>
        </div>
      </Reveal>
    </div>
  );
};

export default IntelligencePage;
