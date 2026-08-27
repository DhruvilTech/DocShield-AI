import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Badge, Card, Button, SectionHeader, cn, CountUp, Reveal } from '../../components/ui';
import { DocumentScanVisual, SecurityRing, ScanLine } from '../../components/security';
import { DEMO_SCAN_RESULTS, formatFileSize, getSeverityColor } from '../../lib/data';

const NDA = DEMO_SCAN_RESULTS['ma-nda'];

export const AnalysisPage: React.FC = () => {
  const [selectedThreatId, setSelectedThreatId] = useState<string>(NDA.threats[0].id);
  const [activeLayer, setActiveLayer] = useState<'visual' | 'neural' | 'pii' | 'hex'>('visual');
  const [activePage, setActivePage] = useState<number>(3);

  const selectedThreat = NDA.threats.find((t) => t.id === selectedThreatId) || NDA.threats[0];

  return (
    <div className="min-h-screen pt-14 bg-transparent">
      <Reveal className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <SectionHeader
            eyebrow="Document Forensics Lab"
            title="Deep Forensic Inspection"
            description="Examine raw byte structures, neural attention layers, steganographic watermarks, and cryptographic signatures."
            className="mb-0"
          />

          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export Forensic Dossier
            </Button>
            <Button variant="primary" size="sm">
              Verify Signatures
            </Button>
          </div>
        </div>

        {/* Forensic Workspace Grid */}
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left Column: Forensic Findings & Evidence Stream */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3 border-b border-[var(--border)] pb-2">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-[var(--text-1)]">
                  Artifact Telemetry
                </span>
                <Badge variant="threat" size="sm" dot>
                  {NDA.threats.length} Flagged Anomalies
                </Badge>
              </div>

              <div className="space-y-2 text-xs font-mono text-[var(--text-2)] mb-4">
                <div className="flex justify-between">
                  <span>File:</span>
                  <span className="text-[var(--text-1)] font-semibold truncate max-w-[170px]">{NDA.fileName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Format:</span>
                  <span className="text-[var(--text-1)]">PDF 1.7 (ISO 32000-1)</span>
                </div>
                <div className="flex justify-between">
                  <span>Entropy:</span>
                  <span className="text-[var(--warning)] font-bold"><CountUp value={7.84} decimals={2} /> bits/byte (High)</span>
                </div>
                <div className="flex justify-between">
                  <span>Pages:</span>
                  <span className="text-[var(--text-1)]">{NDA.pageCount} Pages</span>
                </div>
              </div>

              {/* Entropy Bar */}
              <div className="mb-2">
                <div className="flex justify-between text-[10px] font-mono text-[var(--text-3)] mb-1">
                  <span>BYTE ENTROPY SPECTRUM</span>
                  <span className="text-[var(--warning)]">Anomaly at 0x004F</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-raised)] overflow-hidden flex">
                  <div className="w-1/3 bg-[var(--safe)] opacity-70" />
                  <div className="w-1/4 bg-[var(--accent)] opacity-70" />
                  <div className="w-1/4 bg-[var(--warning)]" />
                  <div className="w-1/6 bg-[var(--threat)] animate-pulse" />
                </div>
              </div>
            </Card>

            {/* Findings List */}
            <div className="space-y-2">
              <div className="text-xs font-bold font-mono text-[var(--text-3)] uppercase px-1">
                Detected Threat Vectors
              </div>
              {NDA.threats.map((threat) => {
                const isSelected = threat.id === selectedThreatId;
                const color = getSeverityColor(threat.severity);
                return (
                  <motion.div
                    key={threat.id}
                    whileHover={{ x: 2 }}
                    onClick={() => {
                      setSelectedThreatId(threat.id);
                      if (threat.id === 'thr-001') {
                        setActivePage(3);
                        setActiveLayer('visual');
                      } else if (threat.id === 'thr-002') {
                        setActivePage(12);
                        setActiveLayer('neural');
                      } else if (threat.id === 'thr-003') {
                        setActivePage(7);
                        setActiveLayer('hex');
                      }
                    }}
                    className={cn(
                      'p-3.5 rounded-xl border cursor-pointer transition-all duration-200',
                      isSelected
                        ? 'border-[var(--border-accent)] bg-[var(--surface-alt)] shadow-[var(--shadow-md)]'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs font-bold text-[var(--text-1)]">{threat.type}</span>
                      </div>
                      <span
                        className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{ color, backgroundColor: `${color}18` }}
                      >
                        {threat.severity}
                      </span>
                    </div>

                    <p className="text-[11px] text-[var(--text-2)] line-clamp-2 leading-relaxed mb-2">
                      {threat.description}
                    </p>

                    <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)]">
                      <span>{threat.location}</span>
                      <span className="text-[var(--accent)] font-semibold">{threat.confidence}% Confidence</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Interactive Document Canvas & Dissection */}
          <div className="lg:col-span-8 space-y-4">
            <DocumentScanVisual
              fileName={NDA.fileName}
              threatsCount={NDA.threats.length}
              activeLayer={activeLayer}
              onLayerChange={setActiveLayer}
            />

            {/* Detailed Forensic Investigation Box */}
            <Card className="p-5 border-[var(--border-accent)]">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-bold text-[var(--accent)] uppercase">
                      Forensic Dissection:
                    </span>
                    <span className="text-sm font-bold text-[var(--text-1)]">{selectedThreat.type}</span>
                  </div>
                  <p className="text-xs text-[var(--text-2)]">{selectedThreat.location}</p>
                </div>

                <SecurityRing
                  progress={selectedThreat.confidence}
                  status={selectedThreat.severity === 'critical' ? 'threat' : 'scanning'}
                  size={52}
                  strokeWidth={3}
                  label="Confidence"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4 text-xs font-mono border-t border-[var(--border)] pt-4 mb-4">
                <div className="p-3 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)]">
                  <span className="text-[10px] text-[var(--text-3)] block mb-1 uppercase font-bold">
                    Forensic Finding
                  </span>
                  <p className="text-[var(--text-1)] leading-relaxed">{selectedThreat.description}</p>
                </div>
                <div className="p-3 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)]">
                  <span className="text-[10px] text-[var(--text-3)] block mb-1 uppercase font-bold text-[var(--accent)]">
                    Remediation Protocol
                  </span>
                  <p className="text-[var(--text-2)] leading-relaxed">{selectedThreat.recommendation}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-[11px] font-mono text-[var(--text-3)]">
                  Cryptographic Timestamp: {new Date(selectedThreat.detected).toUTCString()}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    Isolate Payload
                  </Button>
                  <Button variant="primary" size="sm">
                    Apply Redaction Token
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </Reveal>
    </div>
  );
};

export default AnalysisPage;
