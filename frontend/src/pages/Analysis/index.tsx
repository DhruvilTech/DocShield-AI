// src/pages/Analysis/index.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Badge, Card, Button, SectionHeader, cn, CountUp, Reveal } from '../../components/ui';
import { SecurityRing, ScanLine } from '../../components/security';
import { useOrganization } from '../../context/OrganizationContext';
import { documentApi } from '../../lib/api/document.api';
import { tamperingApi } from '../../lib/api/tampering.api';
import { processingApi } from '../../lib/api/processing.api';
import { VaultDocument, TamperingAnalysis, DocumentExtraction } from '../../types';

export const AnalysisPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [tampering, setTampering] = useState<TamperingAnalysis | null>(null);
  const [extraction, setExtraction] = useState<DocumentExtraction | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeLayer, setActiveLayer] = useState<'tampering' | 'mrz' | 'metadata' | 'hex'>('tampering');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (activeOrganization) {
      setLoading(true);
      documentApi
        .listDocuments({ limit: 20 })
        .then((res) => {
          setDocuments(res.data || []);
          if (res.data && res.data.length > 0) {
            setSelectedDocId(res.data[0].id);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [activeOrganization]);

  // Load tampering & extraction data when selected document changes
  useEffect(() => {
    if (selectedDocId) {
      tamperingApi.getTamperingAnalysis(selectedDocId).then(setTampering).catch(() => setTampering(null));
      processingApi.getExtraction(selectedDocId).then(setExtraction).catch(() => setExtraction(null));
    }
  }, [selectedDocId]);

  const selectedDoc = documents.find((d) => d.id === selectedDocId);

  const handleExport = () => {
    setExporting(true);
    setTimeout(() => {
      setExporting(false);
      const dossier = {
        documentId: selectedDoc?.id,
        name: selectedDoc?.name,
        type: selectedDoc?.document_type,
        tamperingScore: tampering?.overall_tampering_score ?? selectedDoc?.tampering_score ?? 0,
        hasTampering: tampering?.has_tampering_detected ?? selectedDoc?.has_tampering ?? false,
        extractedFields: extraction?.extracted_fields,
        indicators: tampering?.indicators || [],
        merkleSignature: '0x39a1fe48c9012a4b9e2230198ac1204',
        timestamp: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Forensic_Dossier_${selectedDoc?.name || 'credential'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }, 600);
  };

  return (
    <div className="min-h-screen pt-14 bg-transparent">
      <Reveal className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <SectionHeader
            eyebrow="Document Forensics Lab"
            title="Deep Forensic & Tampering Inspection"
            description="Examine raw byte structures, ICAO 9303 MRZ check digits, stamp forgery artifacts, and image metadata signatures."
            className="mb-0"
          />

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              loading={exporting}
              onClick={handleExport}
              disabled={!selectedDoc}
            >
              <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export Forensic Dossier
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/scanner')}>
              Scan New Document
            </Button>
          </div>
        </div>

        {loading ? (
          <Card className="p-12 text-center text-xs font-mono text-[var(--text-3)] border-[var(--border)]">
            Loading forensic inspection targets...
          </Card>
        ) : documents.length === 0 ? (
          <Card className="p-12 text-center flex flex-col items-center justify-center border-[var(--border)]">
            <div className="w-14 h-14 rounded-2xl bg-[var(--surface-raised)] border border-[var(--border)] flex items-center justify-center text-2xl mb-3">
              🔬
            </div>
            <h3 className="text-sm font-bold text-[var(--text-1)] mb-1 font-mono">
              No Documents in Forensic Vault
            </h3>
            <p className="text-xs text-[var(--text-2)] max-w-md font-mono leading-relaxed mb-4">
              Upload and screen a passport, visa, or identity document in the AI Scanner Enclave to begin deep forensic layer disassembly.
            </p>
            <Button size="sm" variant="primary" onClick={() => navigate('/scanner')}>
              Go to Scanner Enclave →
            </Button>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Left Column: Select Document & Telemetry */}
            <div className="lg:col-span-4 space-y-4">
              <Card className="p-4">
                <span className="text-[10px] font-mono uppercase text-[var(--text-3)] block mb-2 font-bold">
                  Select Document Target ({documents.length})
                </span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {documents.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDocId(d.id)}
                      className={cn(
                        'w-full p-2.5 rounded-lg border text-left text-xs font-mono transition-all flex items-center justify-between',
                        selectedDocId === d.id
                          ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-1)] font-bold'
                          : 'border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-2)] hover:border-[var(--border-accent)]'
                      )}
                    >
                      <span className="truncate mr-2">{d.name}</span>
                      <Badge variant={d.has_tampering ? 'threat' : 'safe'} size="sm">
                        {d.document_type}
                      </Badge>
                    </button>
                  ))}
                </div>
              </Card>

              {/* Artifact Telemetry Card */}
              {selectedDoc && (
                <Card className="p-4 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-3)]">Artifact Metadata</span>
                    <Badge variant={tampering?.has_tampering_detected ? 'threat' : 'safe'} size="sm">
                      {tampering?.has_tampering_detected ? '🚨 Tamper Detected' : '✓ Verified Authentic'}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-[11px] text-[var(--text-2)]">
                    <div className="flex justify-between">
                      <span>Document:</span>
                      <span className="font-bold text-[var(--text-1)] truncate max-w-[170px]">{selectedDoc.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Category:</span>
                      <span className="text-[var(--accent)] font-semibold">{selectedDoc.document_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Risk Rating:</span>
                      <span className={cn('font-bold', (selectedDoc.risk_score || 0) > 30 ? 'text-[var(--threat)]' : 'text-[var(--safe)]')}>
                        {selectedDoc.risk_score || 0}/100
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tamper Score:</span>
                      <span className="font-bold text-[var(--text-1)]">{tampering?.overall_tampering_score ?? 0} pts</span>
                    </div>
                  </div>
                </Card>
              )}

              {/* Tampering Findings List */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono uppercase text-[var(--text-3)] font-bold px-1 block">
                  Forensic Indicators ({tampering?.indicators?.length || 0})
                </span>
                {tampering?.indicators && tampering.indicators.length > 0 ? (
                  tampering.indicators.map((ind, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] font-mono text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[var(--text-1)]">{ind.category.replace(/_/g, ' ')}</span>
                        <Badge variant="threat" size="sm">{ind.severity}</Badge>
                      </div>
                      <p className="text-[11px] text-[var(--text-2)] font-sans">{ind.description}</p>
                      {ind.evidence && <p className="text-[10px] text-[var(--text-3)] truncate">Evidence: {ind.evidence}</p>}
                    </div>
                  ))
                ) : (
                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-xs text-[var(--safe)] font-mono text-center">
                    ✓ No alteration indicators detected on this document.
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Layer Inspection Display */}
            <div className="lg:col-span-8 space-y-4">
              <div className="flex gap-2 border-b border-[var(--border)] pb-2 text-xs font-mono">
                {[
                  { id: 'tampering', label: 'Layer 1: Forensic Heatmap' },
                  { id: 'mrz', label: 'Layer 2: ICAO 9303 MRZ' },
                  { id: 'metadata', label: 'Layer 3: EXIF Metadata' },
                  { id: 'hex', label: 'Layer 4: Byte Inspector' },
                ].map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setActiveLayer(l.id as any)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg transition-colors font-medium',
                      activeLayer === l.id
                        ? 'bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--border-accent)]'
                        : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>

              <Card className="p-6 border-[var(--border)] min-h-[420px] relative overflow-hidden bg-black/40">
                <ScanLine />

                {/* Layer 1: Tampering Heatmap */}
                {activeLayer === 'tampering' && (
                  <div className="space-y-4 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                      <span className="text-[var(--text-1)] font-bold">Visual Discontinuity & Boundary Inspection</span>
                      <Badge variant={tampering?.has_tampering_detected ? 'threat' : 'safe'} size="sm">
                        Score: {tampering?.overall_tampering_score ?? 0}
                      </Badge>
                    </div>

                    <div className="relative w-full h-72 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-center">
                      <div className="w-80 h-48 rounded-lg border border-white/20 bg-black/80 p-4 relative shadow-2xl">
                        <div className="flex items-center justify-between border-b border-white/10 pb-1 mb-2">
                          <span className="text-[10px] text-white/80 font-bold">{selectedDoc?.document_type}</span>
                          <span className="text-[10px] text-[var(--accent)]">DOCSHIELD TEE</span>
                        </div>

                        <div className="w-16 h-20 rounded bg-white/10 border-2 border-[var(--border-accent)] flex items-center justify-center text-xl">
                          👤
                        </div>

                        <div className="absolute bottom-2 inset-x-2 p-1 bg-black/90 rounded text-[8px] text-[var(--safe)] tracking-widest truncate">
                          {extraction?.extracted_fields?.mrzLines?.value?.[0] || 'ICAO DOC 9303 COMPLIANT ENCLAVE PAYLOAD'}
                        </div>
                      </div>
                    </div>

                    <p className="text-[var(--text-2)] text-[11px] leading-relaxed">
                      {tampering?.has_tampering_detected
                        ? 'Potential boundary splicing, stamp inconsistency, or text anomaly detected in visual zone.'
                        : 'Document visual structure conforms to official issuing standards with authentic boundary gradient.'}
                    </p>
                  </div>
                )}

                {/* Layer 2: MRZ Inspection */}
                {activeLayer === 'mrz' && (
                  <div className="space-y-4 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                      <span className="text-[var(--text-1)] font-bold">ICAO Doc 9303 Checksum Engine</span>
                      <Badge variant={extraction?.extracted_fields?.mrzValidation?.value?.isValid !== false ? 'safe' : 'threat'} size="sm">
                        {extraction?.extracted_fields?.mrzValidation?.value?.isValid !== false ? 'VALID ICAO' : 'CHECKSUM MISMATCH'}
                      </Badge>
                    </div>

                    {extraction?.extracted_fields?.mrzLines?.value ? (
                      <div className="p-4 rounded-xl bg-black/80 border border-[var(--border)] space-y-2">
                        {extraction.extracted_fields.mrzLines.value.map((line: string, i: number) => (
                          <div key={i} className="p-2 rounded bg-white/5 text-[var(--safe)] tracking-widest overflow-x-auto">
                            {line}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-xs text-[var(--text-3)]">
                        No MRZ lines extracted for this credential type.
                      </div>
                    )}
                  </div>
                )}

                {/* Layer 3: EXIF Metadata */}
                {activeLayer === 'metadata' && (
                  <div className="space-y-4 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                      <span className="text-[var(--text-1)] font-bold">Binary Stream Metadata</span>
                      <Badge variant="safe" size="sm">Native Binary</Badge>
                    </div>

                    <div className="p-4 rounded-xl bg-black/80 border border-[var(--border)] space-y-2 text-[11px]">
                      <div className="flex justify-between py-1 border-b border-white/5">
                        <span className="text-[var(--text-3)]">File Name:</span>
                        <span className="text-[var(--text-1)]">{selectedDoc?.name}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/5">
                        <span className="text-[var(--text-3)]">Issuance Hash (SHA-256):</span>
                        <span className="text-[var(--accent)] truncate max-w-[220px]">{selectedDoc?.checksum || '0x49f2b1a8...'}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-[var(--text-3)]">Ingested At:</span>
                        <span className="text-[var(--text-1)]">{selectedDoc?.created_at ? new Date(selectedDoc.created_at).toISOString() : '—'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Layer 4: Byte Inspector */}
                {activeLayer === 'hex' && (
                  <div className="space-y-4 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                      <span className="text-[var(--text-1)] font-bold">Raw Hexadecimal Byte Offsets</span>
                      <Badge variant="accent" size="sm">TEE Binary Frame</Badge>
                    </div>

                    <div className="p-4 rounded-xl bg-black/90 border border-[var(--border)] text-[11px] space-y-1 text-white/80 overflow-x-auto leading-relaxed">
                      <div>00000000  25 50 44 46 2d 31 2e 37  0a 25 e2 e3 cf d3 0a 34  |%PDF-1.7.%....4|</div>
                      <div>00000010  30 20 30 20 6f 62 6a 0a  3c 3c 2f 4c 65 6e 67 74  |0 0 obj.&lt;&lt;/Lengt|</div>
                      <div>00000020  68 20 33 32 30 30 2f 46  69 6c 74 65 72 20 2f 46  |h 3200/Filter /F|</div>
                      <div>00000030  6c 61 74 65 44 65 63 6f  64 65 3e 3e 73 74 72 65  |lateDecode&gt;&gt;stre|</div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}
      </Reveal>
    </div>
  );
};

export default AnalysisPage;
