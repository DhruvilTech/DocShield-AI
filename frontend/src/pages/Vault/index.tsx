import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge, Card, Button, SectionHeader, cn } from '../../components/ui';
import { ProtectionPerimeter, VerificationAnimation, SecurityRing } from '../../components/security';
import { VAULT_DOCUMENTS, formatFileSize } from '../../lib/data';
import type { DocumentRecord } from '../../types';

const STATUS_META = {
  clean:     { label: 'Clean',     variant: 'safe'    as const },
  protected: { label: 'Protected', variant: 'accent'  as const },
  threat:    { label: 'Threat',    variant: 'threat'  as const },
  flagged:   { label: 'Flagged',   variant: 'warning' as const },
  pending:   { label: 'Pending',   variant: 'neutral' as const },
};

const FILE_ICONS: Record<string, string> = {
  PDF: '📄', DOCX: '📝', XLSX: '📊', TS: '💻', JS: '💻',
};

export const VaultPage: React.FC = () => {
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(VAULT_DOCUMENTS[0]);
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);

  const handleUnlock = () => {
    setIsDecrypting(true);
    setTimeout(() => {
      setIsDecrypting(false);
      setIsUnlocked(true);
    }, 1400);
  };

  return (
    <div className="min-h-screen pt-14 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <SectionHeader
            eyebrow="Zero-Trust Document Vault"
            title="Encrypted Document Enclave"
            description="Sanitized, watermarked, and re-encrypted artifacts stored in hardware-isolated enclave storage with role-bound cryptographic access."
            className="mb-0"
          />

          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Upload & Vault Artifact
            </Button>
          </div>
        </div>

        {/* Global Vault Statistics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Vaulted Artifacts', value: VAULT_DOCUMENTS.length, status: 'info' },
            { label: 'Cryptographically Protected', value: VAULT_DOCUMENTS.filter(d => d.status === 'protected').length, status: 'safe' },
            { label: 'Neutralized Vectors', value: 8, status: 'accent' },
            { label: 'Total Enclave Size', value: formatFileSize(VAULT_DOCUMENTS.reduce((a, d) => a + d.size, 0)), status: 'info' },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="p-4 text-center">
                <div className="text-2xl font-bold font-mono text-[var(--accent)] mb-0.5">{s.value}</div>
                <div className="text-[10px] text-[var(--text-3)] uppercase font-mono">{s.label}</div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Workspace: Documents List + Secure Vault Inspector */}
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Document Archives List */}
          <div className="lg:col-span-7 space-y-3">
            <div className="text-xs font-mono font-bold text-[var(--text-3)] uppercase px-1">
              Encrypted Vault Artifacts
            </div>

            {VAULT_DOCUMENTS.map((doc, i) => {
              const meta = STATUS_META[doc.status];
              const isSelected = selectedDoc?.id === doc.id;

              return (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => {
                    setSelectedDoc(doc);
                    setIsUnlocked(false);
                  }}
                >
                  <Card
                    interactive
                    className={cn(
                      'p-4 cursor-pointer transition-all duration-200',
                      isSelected
                        ? 'border-[var(--border-accent)] bg-[var(--surface-alt)] shadow-[var(--shadow-md)]'
                        : 'border-[var(--border)]'
                    )}
                  >
                    <div className="flex items-center gap-4">
                      {/* File Icon */}
                      <div className="w-10 h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-center text-xl flex-shrink-0">
                        {FILE_ICONS[doc.type] ?? '📄'}
                      </div>

                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-bold text-[var(--text-1)] truncate">{doc.name}</span>
                          <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-3 text-[10px] font-mono text-[var(--text-3)]">
                          <span>{formatFileSize(doc.size)}</span>
                          <span>Vaulted {new Date(doc.uploadedAt).toLocaleDateString()}</span>
                          {doc.threatCount > 0 && (
                            <span className="text-[var(--safe)] font-semibold">
                              ✓ {doc.threatCount} Threats Neutralized
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Risk rating */}
                      <div className="text-right flex-shrink-0">
                        <div
                          className="text-lg font-bold font-mono"
                          style={{
                            color:
                              doc.riskScore >= 60
                                ? 'var(--threat)'
                                : doc.riskScore >= 20
                                ? 'var(--warning)'
                                : 'var(--safe)',
                          }}
                        >
                          {doc.riskScore}
                        </div>
                        <div className="text-[9px] text-[var(--text-3)] font-mono">risk</div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Secure Vault Document Enclave Inspector */}
          <div className="lg:col-span-5">
            {selectedDoc ? (
              <ProtectionPerimeter active={true} state={selectedDoc.riskScore > 50 ? 'alert' : 'secure'}>
                <Card className="p-6 border-[var(--border-accent)] h-full flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-3">
                      <div>
                        <span className="text-[10px] font-mono font-bold uppercase text-[var(--accent)] block">
                          Enclave Containment Box
                        </span>
                        <span className="text-sm font-bold text-[var(--text-1)] truncate block max-w-[200px]">
                          {selectedDoc.name}
                        </span>
                      </div>
                      <Badge variant={selectedDoc.status === 'protected' ? 'accent' : 'safe'} size="sm">
                        {isUnlocked ? 'DECRYPTED' : 'ENCRYPTED AT REST'}
                      </Badge>
                    </div>

                    <div className="space-y-3 font-mono text-xs mb-6">
                      <div className="p-3 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)]">
                        <span className="text-[10px] text-[var(--text-3)] block mb-1 uppercase">
                          Cryptographic Hash (SHA-256)
                        </span>
                        <span className="text-[var(--text-1)] text-[11px] break-all font-mono">
                          {selectedDoc.hash}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)] space-y-1.5 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-[var(--text-3)]">Encryption:</span>
                          <span className="text-[var(--safe)] font-bold">AES-256-GCM (Hardware HSM)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-3)]">Forensic Watermark:</span>
                          <span className="text-[var(--accent)] font-bold">Steganographic ID Bound</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-3)]">Access Policy:</span>
                          <span className="text-[var(--text-1)]">Zero-Trust Role-Bound</span>
                        </div>
                      </div>
                    </div>

                    {isUnlocked && (
                      <div className="mb-4">
                        <VerificationAnimation
                          score={100}
                          label="Ephemeral Decryption Key Verified · Session Expiry in 15m"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-4 border-t border-[var(--border)]">
                    {!isUnlocked ? (
                      <Button
                        variant="primary"
                        size="sm"
                        className="w-full"
                        loading={isDecrypting}
                        onClick={handleUnlock}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0110 0v4" />
                        </svg>
                        {isDecrypting ? 'Verifying HSM Session…' : 'Authenticate & Unlock'}
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button variant="primary" size="sm" className="flex-1">
                          Download Artifact
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setIsUnlocked(false)}>
                          Re-Lock
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              </ProtectionPerimeter>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VaultPage;
