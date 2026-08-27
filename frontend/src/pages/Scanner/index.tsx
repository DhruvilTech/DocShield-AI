import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Badge, Card, SectionHeader, cn, CountUp, Reveal } from '../../components/ui';
import { DocumentScanVisual, SecurityRing, VerificationAnimation, ScanLine } from '../../components/security';
import { DEMO_SCAN_RESULTS, formatFileSize, getSeverityColor } from '../../lib/data';
import type { ScanResult, Threat } from '../../types';

type ScanPhase = 'idle' | 'uploading' | 'parsing' | 'analyzing' | 'complete';

const PHASES: Record<ScanPhase, { label: string; detail: string; progress: number }> = {
  idle:      { label: 'Ready',      detail: 'Drop a document to begin inspection',      progress: 0 },
  uploading: { label: 'Ingesting',  detail: 'Encrypting payload to TEE memory…',        progress: 20 },
  parsing:   { label: 'Decompiling',detail: 'Parsing metadata, OCR, and macro streams…', progress: 50 },
  analyzing: { label: 'AI Scanning',detail: 'Running 6 neural security engines…',       progress: 80 },
  complete:  { label: 'Complete',   detail: 'Threat correlation dossier ready',         progress: 100 },
};

const DEMO_DOCS = [
  { key: 'ma-nda',        label: 'Acquisition NDA (PDF)',          desc: 'M&A legal document with 4 threats' },
  { key: 'healthcare',    label: 'Patient Genomics Report (DOCX)',  desc: 'Medical records with HIPAA violations' },
  { key: 'infrastructure',label: 'Infra Config (TypeScript)',       desc: 'Source code with exposed credentials' },
];

/* ---- Upload Zone ---- */
const UploadZone: React.FC<{
  onUpload: (file?: File, demo?: string) => void;
  disabled?: boolean;
}> = ({ onUpload, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  }, [onUpload]);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          'relative rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200',
          'flex flex-col items-center justify-center p-8 sm:p-10 text-center',
          dragging
            ? 'border-[var(--accent)] bg-[var(--accent-muted)] shadow-[var(--glow-sm)]'
            : 'border-[var(--border)] hover:border-[var(--border-accent)] hover:bg-[var(--surface-alt)]',
          disabled && 'pointer-events-none opacity-50'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.ts,.js,.py,.md,.csv"
          onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
        />

        <div className="w-14 h-14 rounded-2xl border border-[var(--border-accent)] bg-[var(--accent-muted)] flex items-center justify-center mb-4 text-[var(--accent)]">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
          </svg>
        </div>

        <p className="text-sm font-semibold text-[var(--text-1)] mb-1">
          {dragging ? 'Release document into secure sandbox' : 'Drop a document here or click to browse'}
        </p>
        <p className="text-xs text-[var(--text-2)] mb-3">
          PDF, DOCX, XLSX, PPTX, TS/JS/PY, TXT · Maximum 50 MB
        </p>

        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--surface-raised)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-3)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--safe)]" />
          Processed in Hardware-Isolated TEE Memory · Merkle Signed
        </div>
      </div>

      {/* Preset demo options */}
      <div>
        <div className="text-xs font-mono font-bold text-[var(--text-2)] mb-2 uppercase">
          Or simulate real attack vectors:
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          {DEMO_DOCS.map(d => (
            <button
              key={d.key}
              onClick={() => !disabled && onUpload(undefined, d.key)}
              disabled={disabled}
              className={cn(
                'text-left rounded-lg border p-3 transition-all duration-150',
                'hover:border-[var(--border-accent)] hover:bg-[var(--accent-muted)] hover:shadow-[var(--glow-sm)]',
                'border-[var(--border)] bg-[var(--surface)]',
                'disabled:opacity-50 disabled:pointer-events-none'
              )}
            >
              <div className="text-xs font-bold text-[var(--text-1)] leading-tight mb-1 flex items-center justify-between">
                <span>{d.label}</span>
                <span className="text-[10px] text-[var(--accent)] font-mono">→</span>
              </div>
              <div className="text-[10px] text-[var(--text-3)] leading-relaxed">{d.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ---- Scan Progress Display ---- */
const ScanProgress: React.FC<{ phase: ScanPhase; fileName: string }> = ({ phase, fileName }) => {
  const info = PHASES[phase];
  const logs = [
    '[INIT] Hardware-isolated TEE enclave allocated (Intel SGX)',
    '[INGEST] Ephemeral AES-256 session key exchanged',
    '[PARSE] Deep document AST generated — 14 pages structured',
    '[OCR] High-resolution text & glyph tensor extracted',
    '[META] Decoded hidden metadata properties & binary layers',
    '[PII] Scanning 140+ global regulatory identifier patterns',
    '[INJECTION] Neural attention matching for adversarial tokens',
    '[FRAUD] Steganographic signature authenticity verified',
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--accent-muted)] border border-[var(--border-accent)] flex items-center justify-center flex-shrink-0 text-[var(--accent)]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z"/>
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text-1)] truncate">{fileName}</p>
          <p className="text-xs text-[var(--accent)] font-mono">{info.detail}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs font-mono text-[var(--text-2)] mb-1.5">
          <span className="text-[var(--text-1)] font-bold">{info.label}</span>
          <span className="text-[var(--accent)] font-bold">{info.progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-[var(--surface-raised)] overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-[var(--accent)]"
            animate={{ width: `${info.progress}%` }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Live log stream */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
        <div className="px-3.5 py-2 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--safe)] animate-pulse" />
            <span className="text-[10px] font-mono text-[var(--text-3)] uppercase font-bold">
              SECURITY ENGINE LOG STREAM
            </span>
          </div>
          <span className="text-[9px] font-mono text-[var(--accent)]">TEE ENCLAVE: 0x8F92</span>
        </div>
        <div className="p-3 font-mono text-[10px] text-[var(--text-3)] space-y-1.5 max-h-48 overflow-y-auto">
          {logs.slice(0, phase === 'uploading' ? 2 : phase === 'parsing' ? 5 : 8).map((log, i) => (
            <div key={i} className={cn('leading-relaxed', i === (phase === 'uploading' ? 1 : phase === 'parsing' ? 4 : 7) && 'text-[var(--accent)] font-bold')}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ---- Threat Remediation Card ---- */
const ThreatCard: React.FC<{
  threat: Threat;
  index: number;
  remediated: boolean;
  onRemediate: () => void;
}> = ({ threat, index, remediated, onRemediate }) => {
  const [expanded, setExpanded] = useState(false);
  const color = remediated ? 'var(--safe)' : getSeverityColor(threat.severity);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
    >
      <Card className={cn('overflow-hidden transition-colors', remediated && 'border-[#22C55E]/30 bg-[#22C55E]/5')}>
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full text-left p-3.5 flex items-start gap-3"
        >
          <div
            className={cn('mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0', !remediated && 'animate-pulse')}
            style={{ background: color, boxShadow: `0 0 8px ${color}` }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={cn('text-xs font-bold', remediated ? 'line-through text-[var(--text-3)]' : 'text-[var(--text-1)]')}>
                {threat.type}
              </span>
              <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${color}18`, color }}>
                {remediated ? 'NEUTRALIZED' : threat.severity}
              </span>
              <span className="text-[10px] text-[var(--text-3)] font-mono">
                {threat.confidence}% confidence
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-3)] font-mono">{threat.location}</p>
          </div>
          <svg
            className={cn('w-4 h-4 text-[var(--text-3)] flex-shrink-0 mt-0.5 transition-transform duration-200', expanded && 'rotate-180')}
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3 border-t border-[var(--border)] pt-3 text-xs">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-3)] mb-1">Finding Description</p>
                  <p className="text-[var(--text-1)] leading-relaxed">{threat.description}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--accent)] mb-1">Recommended Action</p>
                  <p className="text-[var(--text-2)] leading-relaxed">{threat.recommendation}</p>
                </div>

                {!remediated && (
                  <div className="pt-2 flex justify-end">
                    <Button size="sm" variant="primary" onClick={onRemediate}>
                      Auto-Remediate
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
};

/* ---- Results Panel with Interactive Remediation ---- */
const ScanResults: React.FC<{
  result: ScanResult;
  onReset: () => void;
}> = ({ result, onReset }) => {
  const [remediatedIds, setRemediatedIds] = useState<string[]>([]);
  const isFullySanitized = remediatedIds.length === result.threats.length;

  const currentRisk = isFullySanitized
    ? 0
    : Math.max(0, Math.round(result.riskScore * ((result.threats.length - remediatedIds.length) / result.threats.length)));

  const handleRemediate = (id: string) => {
    setRemediatedIds(prev => prev.includes(id) ? prev : [...prev, id]);
  };

  const handleRemediateAll = () => {
    setRemediatedIds(result.threats.map(t => t.id));
  };

  const riskColor = currentRisk >= 75 ? 'var(--threat)' : currentRisk >= 40 ? 'var(--warning)' : 'var(--safe)';

  return (
    <div className="space-y-5">
      {/* Risk score header */}
      <Card className="p-5 border-[var(--border-accent)]">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
          <div>
            <span className="text-xs text-[var(--text-3)] font-mono uppercase tracking-wider block mb-1">
              Document Risk Assessment
            </span>
            <div className="text-4xl font-bold font-mono transition-colors duration-300" style={{ color: riskColor }}>
              <CountUp value={currentRisk} />
              <span className="text-lg text-[var(--text-3)]">/100</span>
            </div>
            <p className="text-xs text-[var(--text-2)] mt-1 font-mono">{result.fileName}</p>
          </div>

          <SecurityRing
            progress={100 - currentRisk}
            status={currentRisk === 0 ? 'verified' : currentRisk > 50 ? 'threat' : 'scanning'}
            size={74}
            strokeWidth={4}
            label={currentRisk === 0 ? 'Protected' : 'Risk'}
          />
        </div>

        {isFullySanitized && (
          <div className="mb-4">
            <VerificationAnimation
              score={100}
              label="All Threats Neutralized · Deterministic Redaction Applied"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-[10px] font-mono text-[var(--text-3)]">
          <span>SHA-256: {result.hash.slice(0, 24)}...</span>
          <span>SCAN TIME: {result.scanDuration}ms</span>
        </div>
      </Card>

      {/* Threats List */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wide">
            Identified Threat Vectors ({result.threats.length - remediatedIds.length} Unresolved)
          </p>
          {!isFullySanitized && (
            <Button size="sm" variant="outline" onClick={handleRemediateAll}>
              Remediate All
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {result.threats.map((threat, i) => (
            <ThreatCard
              key={threat.id}
              threat={threat}
              index={i}
              remediated={remediatedIds.includes(threat.id)}
              onRemediate={() => handleRemediate(threat.id)}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="primary" size="sm" className="flex-1">
          {isFullySanitized ? 'Download Sanitized Document (PDF)' : 'Download Threat Report'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onReset}>
          Scan Another
        </Button>
      </div>
    </div>
  );
};

/* ---- Main Scanner Page ---- */
export const ScannerPage: React.FC = () => {
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);

  const runScan = useCallback((file?: File, demoKey?: string) => {
    const name = file ? file.name : DEMO_SCAN_RESULTS[demoKey!]?.fileName ?? 'document.pdf';
    setFileName(name);
    setResult(null);
    setPhase('uploading');
    setTimeout(() => setPhase('parsing'), 800);
    setTimeout(() => setPhase('analyzing'), 1900);
    setTimeout(() => {
      setPhase('complete');
      const res = demoKey
        ? DEMO_SCAN_RESULTS[demoKey]
        : DEMO_SCAN_RESULTS['ma-nda'];
      setResult(res);
    }, 3400);
  }, []);

  const reset = useCallback(() => {
    setPhase('idle');
    setFileName('');
    setResult(null);
  }, []);

  return (
    <div className="min-h-screen pt-14 bg-transparent">
      <Reveal className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <SectionHeader
          eyebrow="Active Threat Scanner"
          title="Document Threat & Vulnerability Scanner"
          description="Upload any document to decompile, analyze, and neutralize prompt injections, sensitive PII/PHI leaks, and fraud anomalies in a hardware-isolated TEE sandbox."
        />

        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left Column: Upload or Active Phase Tracker */}
          <div className="lg:col-span-5">
            <AnimatePresence mode="wait">
              {phase === 'idle' ? (
                <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <UploadZone onUpload={runScan} />
                </motion.div>
              ) : phase !== 'complete' ? (
                <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Card className="p-5">
                    <ScanProgress phase={phase} fileName={fileName} />
                  </Card>
                </motion.div>
              ) : (
                <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-[var(--safe)]/15 border border-[var(--safe)]/30 flex items-center justify-center text-[var(--safe)]">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[var(--text-1)]">Inspection Completed</p>
                        <p className="text-xs text-[var(--text-2)]">{result?.scanDuration}ms · {result?.threats.length} anomalies flagged</p>
                      </div>
                    </div>

                    <Button variant="ghost" size="sm" onClick={reset} className="w-full">
                      ← Scan Another Document
                    </Button>
                  </Card>

                  {/* Multi-layer Preview in Completed state */}
                  <DocumentScanVisual
                    fileName={fileName}
                    threatsCount={result?.threats.length ?? 0}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Column: Scan Results & Remediation */}
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div key="results" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                  <ScanResults result={result} onReset={reset} />
                </motion.div>
              ) : (
                <motion.div key="placeholder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Card className="p-10 text-center h-full flex flex-col items-center justify-center min-h-[360px]">
                    <div className="w-14 h-14 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-center mb-4 text-[var(--text-3)]">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-[var(--text-1)] mb-1">Threat analysis awaiting document</p>
                    <p className="text-xs text-[var(--text-2)] max-w-sm">
                      Upload a file or select one of the simulation templates on the left to initiate real-time AI security inspection.
                    </p>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Reveal>
    </div>
  );
};

export default ScannerPage;
