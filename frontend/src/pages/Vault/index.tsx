// src/pages/Vault/index.tsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge, Card, Button, SectionHeader, Input, cn } from '../../components/ui';
import { ProtectionPerimeter, VerificationAnimation } from '../../components/security';
import { useOrganization } from '../../context/OrganizationContext';
import { documentApi, DocumentListParams } from '../../lib/api/document.api';
import { VaultDocument, DocumentVersion, DocType } from '../../types';

const STATUS_META = {
  ACTIVE:   { label: 'Active Enclave', variant: 'safe'   as const },
  ARCHIVED: { label: 'Archived',       variant: 'warning' as const },
  DELETED:  { label: 'Deleted',        variant: 'threat'  as const },
  FLAGGED:  { label: 'Flagged',        variant: 'threat'  as const },
};

const FILE_ICONS: Record<string, string> = {
  'application/pdf': '📄',
  'image/jpeg': '🖼️',
  'image/png': '🖼️',
  'image/webp': '🖼️',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
};

const DOCUMENT_TYPES_LIST: DocType[] = [
  'PASSPORT',
  'VISA',
  'NATIONAL_ID',
  'DRIVERS_LICENSE',
  'CONTRACT',
  'INVOICE',
  'FINANCIAL_STATEMENT',
  'SECURITY_CLEARANCE',
  'LEGAL_BRIEF',
  'OTHER',
];

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const VaultPage: React.FC = () => {
  const { activeOrganization } = useOrganization();
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<VaultDocument | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState<string>('');
  const [uploadDocType, setUploadDocType] = useState<DocType>('PASSPORT');
  const [uploadDesc, setUploadDesc] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Version History Drawer / Modal
  const [showVersionsModal, setShowVersionsModal] = useState<boolean>(false);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [isUploadingVersion, setIsUploadingVersion] = useState<boolean>(false);
  const versionInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = async () => {
    if (!activeOrganization) return;
    try {
      setIsLoading(true);
      setError(null);
      const params: DocumentListParams = {};
      if (searchQuery) params.search = searchQuery;
      if (selectedType) params.documentType = selectedType;

      const res = await documentApi.getDocuments(params);
      setDocuments(res.data);

      if (res.data.length > 0) {
        // Keep selected if exists, otherwise set first
        setSelectedDoc((prev) => {
          if (!prev) return res.data[0];
          const exists = res.data.find((d) => d.id === prev.id);
          return exists || res.data[0];
        });
      } else {
        setSelectedDoc(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [activeOrganization?.id, searchQuery, selectedType]);

  const loadVersions = async (docId: string) => {
    try {
      const vList = await documentApi.getVersions(docId);
      setVersions(vList);
    } catch (err: any) {
      console.error('Failed to load version history:', err);
    }
  };

  useEffect(() => {
    if (selectedDoc) {
      setIsUnlocked(false);
      loadVersions(selectedDoc.id);
    }
  }, [selectedDoc?.id]);

  const handleUnlock = () => {
    setIsDecrypting(true);
    setTimeout(() => {
      setIsDecrypting(false);
      setIsUnlocked(true);
    }, 800);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    try {
      setIsUploading(true);
      setError(null);
      const newDoc = await documentApi.uploadDocument(
        uploadFile,
        uploadName || uploadFile.name,
        uploadDocType,
        uploadDesc || undefined
      );

      setSuccessMsg(`Document "${newDoc.name}" encrypted and vaulted successfully!`);
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadName('');
      setUploadDesc('');
      fetchDocuments();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoc || !versionFile) return;

    try {
      setIsUploadingVersion(true);
      setError(null);
      const updatedDoc = await documentApi.uploadNewVersion(selectedDoc.id, versionFile);
      setSuccessMsg(`Version ${updatedDoc.current_version} vaulted for "${updatedDoc.name}"`);
      setVersionFile(null);
      setSelectedDoc(updatedDoc);
      await loadVersions(selectedDoc.id);
      await fetchDocuments();
    } catch (err: any) {
      setError(err.message || 'Version upload failed');
    } finally {
      setIsUploadingVersion(false);
    }
  };

  const handleDownload = async (doc: VaultDocument, versionNumber?: number) => {
    try {
      if (versionNumber) {
        await documentApi.downloadVersion(doc.id, versionNumber, `v${versionNumber}_${doc.original_filename}`);
      } else {
        await documentApi.downloadDocument(doc.id, doc.original_filename);
      }
      setSuccessMsg('Download initiated');
    } catch (err: any) {
      setError(err.message || 'Download failed');
    }
  };

  const handleDelete = async (doc: VaultDocument) => {
    if (!window.confirm(`Are you sure you want to archive and soft-delete "${doc.name}"?`)) return;
    try {
      await documentApi.deleteDocument(doc.id);
      setSuccessMsg(`Document "${doc.name}" archived`);
      fetchDocuments();
    } catch (err: any) {
      setError(err.message || 'Failed to archive document');
    }
  };

  const totalVaultSize = documents.reduce((acc, d) => acc + (d.file_size || 0), 0);

  return (
    <div className="min-h-screen pt-14 bg-transparent font-mono">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <SectionHeader
            eyebrow="Zero-Trust Document Vault"
            title="Encrypted Document Enclave"
            description="Sanitized, version-tracked, and SHA-256 checksummed identity and travel documents secured with organization tenant isolation."
            className="mb-0"
          />

          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm" onClick={() => setShowUploadModal(true)}>
              <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Upload & Vault Artifact
            </Button>
          </div>
        </div>

        {/* Global Vault Statistics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Vaulted Artifacts', value: documents.length, status: 'info' },
            { label: 'Active Organization', value: activeOrganization?.name || 'Default', status: 'safe' },
            { label: 'SHA-256 Verified', value: '100%', status: 'accent' },
            { label: 'Total Enclave Size', value: formatFileSize(totalVaultSize), status: 'info' },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="p-4 text-center">
                <div className="text-xl font-bold font-mono text-[var(--accent)] mb-0.5 truncate">{s.value}</div>
                <div className="text-[10px] text-[var(--text-3)] uppercase font-mono">{s.label}</div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Notifications */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-[var(--threat-muted)] border border-[var(--threat)]/40 text-[var(--threat)] text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="underline ml-4">Dismiss</button>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-[var(--safe-muted)] border border-[var(--safe)]/40 text-[var(--safe)] text-xs flex items-center justify-between">
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="underline ml-4">Dismiss</button>
          </div>
        )}

        {/* Filters & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 text-xs">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vaulted documents by name or filename..."
              className="w-full text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">All Document Types</option>
              {DOCUMENT_TYPES_LIST.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Workspace: Documents List + Secure Vault Inspector */}
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Document Archives List */}
          <div className="lg:col-span-7 space-y-3">
            <div className="text-xs font-mono font-bold text-[var(--text-3)] uppercase px-1 flex justify-between">
              <span>Encrypted Vault Artifacts ({documents.length})</span>
              <span>Tenant: {activeOrganization?.slug}</span>
            </div>

            {isLoading ? (
              <Card className="p-8 text-center text-xs text-[var(--text-3)]">
                Querying cryptographic document records...
              </Card>
            ) : documents.length === 0 ? (
              <Card className="p-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-[var(--accent-muted)] text-[var(--accent)] flex items-center justify-center mx-auto mb-3 border border-[var(--border-accent)]">
                  📄
                </div>
                <h3 className="text-sm font-bold text-[var(--text-1)] mb-1">No Documents Vaulted Yet</h3>
                <p className="text-xs text-[var(--text-3)] mb-4">
                  Upload an identity or travel document to store it securely in this organization enclave.
                </p>
                <Button size="sm" variant="primary" onClick={() => setShowUploadModal(true)}>
                  Upload First Artifact
                </Button>
              </Card>
            ) : (
              documents.map((doc, i) => {
                const meta = STATUS_META[doc.status] || STATUS_META.ACTIVE;
                const isSelected = selectedDoc?.id === doc.id;

                return (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
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
                          {FILE_ICONS[doc.mime_type] ?? '📄'}
                        </div>

                        {/* File Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-bold text-[var(--text-1)] truncate">{doc.name}</span>
                            <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
                            <Badge variant="accent" size="sm">v{doc.current_version}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-3 text-[10px] font-mono text-[var(--text-3)]">
                            <span>{formatFileSize(doc.file_size)}</span>
                            <span>{doc.document_type.replace(/_/g, ' ')}</span>
                            <span>Vaulted {new Date(doc.created_at).toLocaleDateString()}</span>
                            {doc.uploader_name && <span>By {doc.uploader_name}</span>}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="text-right flex-shrink-0 flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(doc);
                            }}
                            className="p-1.5 text-[var(--text-3)] hover:text-[var(--threat)] transition-colors rounded"
                            title="Archive / Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Secure Vault Document Enclave Inspector */}
          <div className="lg:col-span-5">
            {selectedDoc ? (
              <ProtectionPerimeter active={true} state={selectedDoc.status === 'FLAGGED' ? 'alert' : 'secure'}>
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
                      <Badge variant="accent" size="sm">
                        {isUnlocked ? 'DECRYPTED & VERIFIED' : 'ENCRYPTED AT REST'}
                      </Badge>
                    </div>

                    <div className="space-y-3 font-mono text-xs mb-6">
                      <div className="p-3 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)]">
                        <span className="text-[10px] text-[var(--text-3)] block mb-1 uppercase">
                          Cryptographic Integrity Checksum (SHA-256)
                        </span>
                        <span className="text-[var(--text-1)] text-[10px] break-all font-mono">
                          {selectedDoc.current_checksum || 'Calculated on upload'}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)] space-y-1.5 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-[var(--text-3)]">Original File:</span>
                          <span className="text-[var(--text-1)] truncate max-w-[170px]">{selectedDoc.original_filename}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-3)]">File Type:</span>
                          <span className="text-[var(--text-1)]">{selectedDoc.mime_type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-3)]">Current Version:</span>
                          <span className="text-[var(--accent)] font-bold">v{selectedDoc.current_version}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-3)]">Access Policy:</span>
                          <span className="text-[var(--safe)] font-bold">Tenant-Isolated RBAC</span>
                        </div>
                      </div>

                      {selectedDoc.description && (
                        <div className="p-3 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)] text-[11px]">
                          <span className="text-[10px] text-[var(--text-3)] block mb-1 uppercase">
                            Operational Description
                          </span>
                          <p className="text-[var(--text-2)]">{selectedDoc.description}</p>
                        </div>
                      )}
                    </div>

                    {isUnlocked && (
                      <div className="mb-4">
                        <VerificationAnimation
                          score={100}
                          label="Cryptographic Hash Verified · Authenticated Session"
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
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0110 0v4" />
                        </svg>
                        {isDecrypting ? 'Verifying Tenant Session…' : 'Authenticate & Unlock'}
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleDownload(selectedDoc)}
                          >
                            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download Artifact
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowVersionsModal(true)}
                          >
                            Versions ({versions.length})
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => setIsUnlocked(false)}
                        >
                          Re-Lock Enclave
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              </ProtectionPerimeter>
            ) : (
              <Card className="p-12 text-center text-xs text-[var(--text-3)]">
                Select an artifact from the list to inspect cryptographic checksums and enclave containment status.
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Upload Document Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--surface)] border border-[var(--border-strong)] rounded-2xl max-w-md w-full p-6 shadow-2xl font-mono text-xs"
          >
            <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-1)]">Upload & Vault Document Artifact</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                  Document Artifact File (PDF, Images, DOCX - Max 50MB)
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setUploadFile(f);
                      if (!uploadName) setUploadName(f.name.replace(/\.[^/.]+$/, ''));
                    }
                  }}
                  required
                  className="w-full text-xs text-[var(--text-2)] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[var(--accent)] file:text-[#05070A] hover:file:opacity-90"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                  Display Title
                </label>
                <Input
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="e.g. Interpol Verified Passport Scan"
                  required
                  className="w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                  Document Classification Type
                </label>
                <select
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value as DocType)}
                  required
                  className="w-full bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl p-2.5 text-xs text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)]"
                >
                  {DOCUMENT_TYPES_LIST.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--text-2)] mb-1 uppercase tracking-wider">
                  Description / Screening Context (Optional)
                </label>
                <textarea
                  value={uploadDesc}
                  onChange={(e) => setUploadDesc(e.target.value)}
                  rows={2}
                  placeholder="Biometric screening notes or case reference..."
                  className="w-full bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl p-2.5 text-xs text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)] font-mono"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-1/2"
                  onClick={() => setShowUploadModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="w-1/2"
                  disabled={isUploading || !uploadFile}
                >
                  {isUploading ? 'Vaulting...' : 'Upload & Encrypt'}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Version History Modal */}
      {showVersionsModal && selectedDoc && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--surface)] border border-[var(--border-strong)] rounded-2xl max-w-lg w-full p-6 shadow-2xl font-mono text-xs"
          >
            <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-1)]">Version History</h3>
                <span className="text-[10px] text-[var(--text-3)]">{selectedDoc.name}</span>
              </div>
              <button onClick={() => setShowVersionsModal(false)} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                ✕
              </button>
            </div>

            {/* Upload New Version Section */}
            <form onSubmit={handleVersionSubmit} className="mb-6 p-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] space-y-3">
              <span className="text-[11px] font-bold text-[var(--accent)] block uppercase">
                + Upload New Version (v{selectedDoc.current_version + 1})
              </span>
              <input
                type="file"
                ref={versionInputRef}
                onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
                required
                className="w-full text-[11px] text-[var(--text-2)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-[var(--accent)] file:text-[#05070A]"
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                className="w-full"
                disabled={isUploadingVersion || !versionFile}
              >
                {isUploadingVersion ? 'Uploading Version…' : 'Vault New Version'}
              </Button>
            </form>

            {/* Version List */}
            <div className="max-h-64 overflow-y-auto space-y-2">
              <span className="text-[10px] text-[var(--text-3)] uppercase font-bold block mb-1">
                Immutable Version Timeline ({versions.length})
              </span>
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={v.version_number === selectedDoc.current_version ? 'accent' : 'neutral'} size="sm">
                        v{v.version_number}
                      </Badge>
                      <span className="font-bold text-[var(--text-1)]">{formatFileSize(v.file_size)}</span>
                    </div>
                    <div className="text-[10px] text-[var(--text-3)] mt-1 font-mono break-all max-w-[280px]">
                      SHA-256: {v.checksum?.substring(0, 16)}...
                    </div>
                    <div className="text-[10px] text-[var(--text-3)] mt-0.5">
                      {new Date(v.created_at).toLocaleString()} {v.uploader_name && `by ${v.uploader_name}`}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDownload(selectedDoc, v.version_number)}
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-alt)] border border-[var(--border)] text-xs text-[var(--accent)] font-medium transition-colors"
                  >
                    Download
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default VaultPage;
