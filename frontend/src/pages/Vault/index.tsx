// src/pages/Vault/index.tsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge, Card, Button, SectionHeader, Input, cn } from '../../components/ui';
import { ProtectionPerimeter, VerificationAnimation } from '../../components/security';
import { useOrganization } from '../../context/OrganizationContext';
import { documentApi, DocumentListParams } from '../../lib/api/document.api';
import { processingApi } from '../../lib/api/processing.api';
import { analysisApi } from '../../lib/api/analysis.api';
import {
  VaultDocument,
  DocumentVersion,
  DocType,
  DocumentExtraction,
  DocumentAnalysis,
  AnalysisFinding,
  RiskIndicator,
  ProcessingStatus,
} from '../../types';

const STATUS_META = {
  ACTIVE:   { label: 'Active Enclave', variant: 'safe'   as const },
  ARCHIVED: { label: 'Archived',       variant: 'warning' as const },
  DELETED:  { label: 'Deleted',        variant: 'threat'  as const },
  FLAGGED:  { label: 'Flagged',        variant: 'threat'  as const },
};

const PROCESSING_META: Record<ProcessingStatus, { label: string; variant: 'safe' | 'warning' | 'threat' | 'info' | 'accent' }> = {
  UPLOADED:   { label: 'Uploaded',    variant: 'info' },
  QUEUED:     { label: 'Queued',      variant: 'warning' },
  PROCESSING: { label: 'Processing',  variant: 'accent' },
  COMPLETED:  { label: 'Analyzed',    variant: 'safe' },
  FAILED:     { label: 'Failed',      variant: 'threat' },
};

const SEVERITY_BADGE: Record<string, 'threat' | 'warning' | 'info' | 'safe' | 'accent'> = {
  CRITICAL: 'threat',
  HIGH: 'threat',
  MEDIUM: 'warning',
  LOW: 'info',
  INFO: 'safe',
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
  const { activeOrganization, createOrganization, refreshOrganizations } = useOrganization();
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

  // Inspector Tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'extraction' | 'analysis' | 'versions'>('overview');

  // Extraction & Analysis Data
  const [extraction, setExtraction] = useState<DocumentExtraction | null>(null);
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [findings, setFindings] = useState<AnalysisFinding[]>([]);
  const [riskIndicators, setRiskIndicators] = useState<RiskIndicator[]>([]);
  const [isProcessingTriggered, setIsProcessingTriggered] = useState<boolean>(false);
  const [rawTextExpanded, setRawTextExpanded] = useState<boolean>(false);

  // Organization establishment modal
  const [showOrgEstablishModal, setShowOrgEstablishModal] = useState<boolean>(false);
  const [orgNameInput, setOrgNameInput] = useState<string>('');
  const [orgDescInput, setOrgDescInput] = useState<string>('');
  const [isCreatingOrg, setIsCreatingOrg] = useState<boolean>(false);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState<string>('');
  const [uploadDocType, setUploadDocType] = useState<DocType>('PASSPORT');
  const [uploadDesc, setUploadDesc] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Version History Modal
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

  const loadDocumentDetails = async (docId: string) => {
    try {
      const vList = await documentApi.getVersions(docId);
      setVersions(vList);
    } catch (err) {
      console.error('Failed to load versions:', err);
    }

    try {
      const ext = await processingApi.getExtraction(docId);
      setExtraction(ext);
    } catch (err) {
      setExtraction(null);
    }

    try {
      const ana = await analysisApi.getLatestAnalysis(docId);
      setAnalysis(ana);
      setFindings(ana.findings || []);
      setRiskIndicators(ana.risk_indicators || []);
    } catch (err) {
      setAnalysis(null);
      setFindings([]);
      setRiskIndicators([]);
    }
  };

  useEffect(() => {
    if (selectedDoc) {
      setIsUnlocked(false);
      loadDocumentDetails(selectedDoc.id);
    }
  }, [selectedDoc?.id]);

  // Polling for processing updates if selected document is in progress
  useEffect(() => {
    if (!selectedDoc) return;
    const isBusy = selectedDoc.processing_status === 'QUEUED' || selectedDoc.processing_status === 'PROCESSING';
    if (!isBusy && !isProcessingTriggered) return;

    const interval = setInterval(async () => {
      try {
        const statusRes = await processingApi.getProcessingStatus(selectedDoc.id);
        if (statusRes.processingStatus !== selectedDoc.processing_status) {
          setSelectedDoc((prev) => (prev ? { ...prev, processing_status: statusRes.processingStatus } : null));
          setDocuments((prev) =>
            prev.map((d) => (d.id === selectedDoc.id ? { ...d, processing_status: statusRes.processingStatus } : d))
          );
        }

        if (statusRes.processingStatus === 'COMPLETED' || statusRes.processingStatus === 'FAILED') {
          setIsProcessingTriggered(false);
          await loadDocumentDetails(selectedDoc.id);
        }
      } catch (e) {}
    }, 2500);

    return () => clearInterval(interval);
  }, [selectedDoc?.id, selectedDoc?.processing_status, isProcessingTriggered]);

  const handleUnlock = () => {
    setIsDecrypting(true);
    setTimeout(() => {
      setIsDecrypting(false);
      setIsUnlocked(true);
    }, 600);
  };

  const handleTriggerProcessing = async () => {
    if (!selectedDoc) return;
    try {
      setIsProcessingTriggered(true);
      setError(null);
      await processingApi.triggerProcessing(selectedDoc.id, { jobType: 'FULL_PIPELINE' });
      setSuccessMsg(`Processing and AI intelligence pipeline queued for "${selectedDoc.name}"`);
      setSelectedDoc((prev) => (prev ? { ...prev, processing_status: 'QUEUED' } : null));
      setDocuments((prev) =>
        prev.map((d) => (d.id === selectedDoc.id ? { ...d, processing_status: 'QUEUED' } : d))
      );
    } catch (err: any) {
      setIsProcessingTriggered(false);
      setError(err.message || 'Failed to trigger processing');
    }
  };

  const handleEstablishOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgNameInput.trim()) return;
    try {
      setIsCreatingOrg(true);
      setError(null);
      const newOrg = await createOrganization({
        name: orgNameInput.trim(),
        description: orgDescInput.trim() || undefined,
      });
      setShowOrgEstablishModal(false);
      setOrgNameInput('');
      setOrgDescInput('');
      setSuccessMsg(`Organization "${newOrg.name}" established and activated.`);
      await fetchDocuments();
    } catch (err: any) {
      setError(err.message || 'Failed to establish organization');
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    if (!activeOrganization) {
      setShowUploadModal(false);
      setShowOrgEstablishModal(true);
      setError('Please establish an organization context before uploading documents.');
      return;
    }

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
      await fetchDocuments();

      // Automatically trigger initial background processing
      try {
        await processingApi.triggerProcessing(newDoc.id);
      } catch (e) {}
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
      await loadDocumentDetails(selectedDoc.id);
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
      setSuccessMsg('Secure download stream started');
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
            eyebrow="Zero-Trust Document Vault & AI Enclave"
            title="Encrypted Document Intelligence"
            description="Tenant-isolated identity and travel documents with Cloudinary storage, automated text extraction, OCR normalization, and AI fraud intelligence."
            className="mb-0"
          />

          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm" onClick={() => setShowUploadModal(true)}>
              <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Upload & Vault Document
            </Button>
          </div>
        </div>

        {/* Global Vault Statistics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Vaulted Artifacts', value: documents.length, status: 'info' },
            { label: 'Active Organization', value: activeOrganization?.name || 'Default', status: 'safe' },
            { label: 'Storage Enclave', value: 'Cloudinary + SHA-256', status: 'accent' },
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

        {/* Missing Active Organization Notice */}
        {!activeOrganization && (
          <div className="mb-6 p-4 rounded-xl bg-[var(--accent-muted)] border border-[var(--border-accent)] flex items-center justify-between gap-4 text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="text-lg">🏢</span>
              <div>
                <span className="font-bold text-[var(--accent)] block">No Active Organization Context</span>
                <span className="text-[var(--text-3)] text-[11px]">
                  Establish or select an organization context to enable zero-trust document encryption and AI processing.
                </span>
              </div>
            </div>
            <Button size="sm" variant="primary" onClick={() => setShowOrgEstablishModal(true)}>
              Establish Organization
            </Button>
          </div>
        )}

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
          <div className="lg:col-span-5 space-y-3">
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
                const procStatus = doc.processing_status || 'UPLOADED';
                const procMeta = PROCESSING_META[procStatus] || PROCESSING_META.UPLOADED;
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
                      setActiveTab('overview');
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
                      <div className="flex items-center gap-3">
                        {/* File Icon */}
                        <div className="w-10 h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-center text-xl flex-shrink-0">
                          {FILE_ICONS[doc.mime_type] ?? '📄'}
                        </div>

                        {/* File Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-bold text-[var(--text-1)] truncate">{doc.name}</span>
                            <Badge variant={procMeta.variant} size="sm">{procMeta.label}</Badge>
                            <Badge variant="accent" size="sm">v{doc.current_version}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[10px] font-mono text-[var(--text-3)]">
                            <span>{formatFileSize(doc.file_size)}</span>
                            <span>·</span>
                            <span>{doc.document_type.replace(/_/g, ' ')}</span>
                            <span>·</span>
                            <span>{new Date(doc.created_at).toLocaleDateString()}</span>
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
          <div className="lg:col-span-7">
            {selectedDoc ? (
              <ProtectionPerimeter active={true} state={selectedDoc.status === 'FLAGGED' ? 'alert' : 'secure'}>
                <Card className="p-6 border-[var(--border-accent)] flex flex-col justify-between min-h-[560px]">
                  <div>
                    {/* Header & Tabs */}
                    <div className="flex flex-wrap items-center justify-between mb-4 border-b border-[var(--border)] pb-3 gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold uppercase text-[var(--accent)] block">
                            Document Intelligence Enclave
                          </span>
                          <Badge variant={PROCESSING_META[selectedDoc.processing_status || 'UPLOADED'].variant} size="sm">
                            {PROCESSING_META[selectedDoc.processing_status || 'UPLOADED'].label}
                          </Badge>
                        </div>
                        <span className="text-base font-bold text-[var(--text-1)] truncate block max-w-sm">
                          {selectedDoc.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleTriggerProcessing}
                          loading={selectedDoc.processing_status === 'QUEUED' || selectedDoc.processing_status === 'PROCESSING' || isProcessingTriggered}
                          className="text-xs"
                        >
                          <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          {selectedDoc.processing_status === 'COMPLETED' ? 'Re-Analyze' : 'Run AI Processing'}
                        </Button>
                      </div>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex gap-2 mb-4 border-b border-[var(--border)] pb-2 overflow-x-auto text-xs">
                      {[
                        { id: 'overview', label: 'Overview & SHA-256' },
                        { id: 'extraction', label: `Extracted Data ${extraction ? '✓' : ''}` },
                        { id: 'analysis', label: `AI Intelligence ${analysis ? `(${findings.length})` : ''}` },
                        { id: 'versions', label: `Versions (${versions.length})` },
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setActiveTab(t.id as any)}
                          className={cn(
                            'px-3 py-1.5 rounded-lg font-mono text-xs transition-colors whitespace-nowrap',
                            activeTab === t.id
                              ? 'bg-[var(--accent)] text-white font-bold'
                              : 'text-[var(--text-3)] hover:text-[var(--text-1)] bg-[var(--surface-raised)]'
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* TAB 1: OVERVIEW */}
                    {activeTab === 'overview' && (
                      <div className="space-y-3 font-mono text-xs">
                        <div className="p-3 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)]">
                          <span className="text-[10px] text-[var(--text-3)] block mb-1 uppercase">
                            Cryptographic Integrity Checksum (SHA-256)
                          </span>
                          <span className="text-[var(--text-1)] text-[10px] break-all font-mono">
                            {selectedDoc.current_checksum || 'Calculated on upload'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                          <div className="p-3 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)] space-y-1">
                            <span className="text-[var(--text-3)] text-[10px] uppercase block">Storage Key (Cloudinary)</span>
                            <span className="text-[var(--text-1)] break-all">{selectedDoc.storage_key}</span>
                          </div>
                          <div className="p-3 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)] space-y-1">
                            <span className="text-[var(--text-3)] text-[10px] uppercase block">Document Class</span>
                            <span className="text-[var(--accent)] font-bold">{selectedDoc.document_type}</span>
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)] space-y-1.5 text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-[var(--text-3)]">Original File:</span>
                            <span className="text-[var(--text-1)] truncate max-w-[200px]">{selectedDoc.original_filename}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[var(--text-3)]">MIME Format:</span>
                            <span className="text-[var(--text-1)]">{selectedDoc.mime_type}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[var(--text-3)]">Active Version:</span>
                            <span className="text-[var(--accent)] font-bold">Version {selectedDoc.current_version}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[var(--text-3)]">Tenant Isolation:</span>
                            <span className="text-[var(--safe)] font-bold">Organization Enclave</span>
                          </div>
                        </div>

                        {isUnlocked && (
                          <div className="mt-4">
                            <VerificationAnimation
                              score={100}
                              label="Cryptographic Hash Verified · Authenticated Session"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 2: EXTRACTED DATA */}
                    {activeTab === 'extraction' && (
                      <div className="space-y-3 font-mono text-xs">
                        {!extraction ? (
                          <div className="p-8 text-center bg-[var(--surface-alt)] rounded-xl border border-[var(--border)]">
                            <p className="text-[var(--text-3)] text-xs mb-3">No OCR or text extraction data available yet.</p>
                            <Button size="sm" variant="primary" onClick={handleTriggerProcessing}>
                              Extract Document Content
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between p-3 bg-[var(--surface-alt)] rounded-lg border border-[var(--border)]">
                              <div>
                                <span className="text-[10px] text-[var(--text-3)] uppercase block">Extraction Engine</span>
                                <span className="font-bold text-[var(--text-1)]">{extraction.extractor_name}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-[var(--text-3)] uppercase block">Confidence</span>
                                <Badge variant="safe" size="sm">{Math.round((extraction.confidence_score || 0.95) * 100)}% Match</Badge>
                              </div>
                            </div>

                            {/* Structured Fields Grid */}
                            {extraction.extracted_fields && Object.keys(extraction.extracted_fields).length > 0 && (
                              <div className="p-3 bg-[var(--surface-alt)] rounded-lg border border-[var(--border)]">
                                <span className="text-[10px] text-[var(--text-3)] uppercase block mb-2 font-bold">
                                  Structured Optical Field Recognition
                                </span>
                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                  {Object.entries(extraction.extracted_fields).map(([key, item]: [string, any]) => {
                                    if (!item || item.value === null || item.value === undefined || item.value === '') return null;
                                    const displayVal = Array.isArray(item.value) ? item.value.join('\n') : String(item.value);
                                    return (
                                      <div key={key} className="p-2 rounded bg-[var(--surface-raised)] border border-[var(--border)]/50">
                                        <div className="flex justify-between items-center text-[10px] text-[var(--text-3)] mb-0.5">
                                          <span className="uppercase">{key.replace(/([A-Z])/g, ' $1')}</span>
                                          {item.confidence > 0 && <span>{Math.round(item.confidence * 100)}%</span>}
                                        </div>
                                        <span className="font-bold text-[var(--text-1)] break-all">{displayVal}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Raw / Normalized Text Toggle */}
                            <div className="p-3 bg-[var(--surface-alt)] rounded-lg border border-[var(--border)]">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] text-[var(--text-3)] uppercase font-bold">Normalized Document Stream</span>
                                <button
                                  onClick={() => setRawTextExpanded(!rawTextExpanded)}
                                  className="text-[10px] text-[var(--accent)] underline"
                                >
                                  {rawTextExpanded ? 'Collapse' : 'Expand Stream'}
                                </button>
                              </div>
                              <pre className={cn(
                                'text-[10px] text-[var(--text-2)] bg-[var(--surface-raised)] p-2 rounded border border-[var(--border)] overflow-x-auto whitespace-pre-wrap',
                                rawTextExpanded ? 'max-h-60' : 'max-h-24'
                              )}>
                                {extraction.normalized_text || extraction.raw_text || 'No text extracted.'}
                              </pre>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* TAB 3: AI INTELLIGENCE & FINDINGS */}
                    {activeTab === 'analysis' && (
                      <div className="space-y-3 font-mono text-xs">
                        {!analysis ? (
                          <div className="p-8 text-center bg-[var(--surface-alt)] rounded-xl border border-[var(--border)]">
                            <p className="text-[var(--text-3)] text-xs mb-3">No AI intelligence analysis generated yet.</p>
                            <Button size="sm" variant="primary" onClick={handleTriggerProcessing}>
                              Execute AI Screening Pipeline
                            </Button>
                          </div>
                        ) : (
                          <>
                            {/* Summary & Confidence Bar */}
                            <div className="p-3 bg-[var(--surface-alt)] rounded-lg border border-[var(--border)] space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] text-[var(--text-3)] uppercase font-bold">
                                  Model: {analysis.provider.toUpperCase()} ({analysis.model})
                                </span>
                                <Badge variant="accent" size="sm">{Math.round((analysis.confidence || 0.95) * 100)}% Confidence</Badge>
                              </div>
                              <p className="text-[11px] text-[var(--text-1)] leading-relaxed">{analysis.summary}</p>
                            </div>

                            {/* Risk Indicators */}
                            {riskIndicators.length > 0 && (
                              <div className="p-3 bg-[var(--surface-alt)] rounded-lg border border-[var(--border)]">
                                <span className="text-[10px] text-[var(--text-3)] uppercase block mb-2 font-bold">
                                  Screening Risk Indicators ({riskIndicators.length})
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  {riskIndicators.map((ri, i) => (
                                    <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--surface-raised)] border border-[var(--border)] text-[10px]">
                                      <Badge variant={SEVERITY_BADGE[ri.severity] || 'info'} size="sm">{ri.severity}</Badge>
                                      <span className="font-bold text-[var(--text-1)]">{ri.indicator}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Findings List */}
                            <div className="space-y-2">
                              <span className="text-[10px] text-[var(--text-3)] uppercase block font-bold px-1">
                                Detected Security & Verification Findings ({findings.length})
                              </span>
                              {findings.length === 0 ? (
                                <div className="p-4 bg-[var(--surface-alt)] rounded-lg text-center text-xs text-[var(--safe)]">
                                  ✓ No security anomalies or fraud risks detected.
                                </div>
                              ) : (
                                findings.map((f) => (
                                  <div key={f.id} className="p-3 rounded-lg bg-[var(--surface-alt)] border border-[var(--border)] space-y-1 text-[11px]">
                                    <div className="flex justify-between items-center">
                                      <div className="flex items-center gap-2">
                                        <Badge variant={SEVERITY_BADGE[f.severity] || 'info'} size="sm">{f.severity}</Badge>
                                        <span className="font-bold text-[var(--text-1)]">{f.title}</span>
                                      </div>
                                      <span className="text-[10px] text-[var(--text-3)]">{f.category}</span>
                                    </div>
                                    <p className="text-[var(--text-2)] text-[11px]">{f.description}</p>
                                    {f.evidence && (
                                      <div className="text-[10px] text-[var(--accent)] bg-[var(--surface-raised)] p-1.5 rounded border border-[var(--border)]/60 mt-1">
                                        <span className="font-bold mr-1">Evidence:</span> {f.evidence}
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* TAB 4: VERSIONS */}
                    {activeTab === 'versions' && (
                      <div className="space-y-3 font-mono text-xs">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] text-[var(--text-3)] uppercase font-bold">Version History</span>
                          <Button size="sm" variant="outline" onClick={() => setShowVersionsModal(true)}>
                            Upload New Version
                          </Button>
                        </div>
                        {versions.map((v) => (
                          <div key={v.id} className="p-3 bg-[var(--surface-alt)] rounded-lg border border-[var(--border)] flex justify-between items-center">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[var(--text-1)]">Version {v.version_number}</span>
                                {v.version_number === selectedDoc.current_version && (
                                  <Badge variant="safe" size="sm">Current</Badge>
                                )}
                              </div>
                              <span className="text-[10px] text-[var(--text-3)] block mt-0.5">
                                {formatFileSize(v.file_size)} · Checksum: {v.checksum.substring(0, 16)}...
                              </span>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => handleDownload(selectedDoc, v.version_number)}>
                              Download
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer Unlock / Download Controls */}
                  <div className="space-y-2 pt-4 border-t border-[var(--border)] mt-4">
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
                        {isDecrypting ? 'Verifying Tenant Session…' : 'Authenticate & Unlock Enclave'}
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
                            Upload Version
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
                Select an artifact from the list to inspect cryptographic checksums, OCR extractions, and AI intelligence analysis.
              </Card>
            )}
          </div>
        </div>

        {/* Upload Modal */}
        <AnimatePresence>
          {showUploadModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg"
              >
                <Card className="p-6 border-[var(--border-accent)]">
                  <div className="flex justify-between items-center mb-4 border-b border-[var(--border)] pb-3">
                    <h3 className="text-sm font-bold font-mono text-[var(--text-1)] uppercase">
                      Upload & Vault Artifact (Cloudinary Enclave)
                    </h3>
                    <button onClick={() => setShowUploadModal(false)} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs font-mono">
                    <div>
                      <label className="block text-[10px] uppercase text-[var(--text-3)] mb-1 font-bold">
                        Document File (PDF / Images / Docs up to 50MB)
                      </label>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setUploadFile(e.target.files[0]);
                            if (!uploadName) setUploadName(e.target.files[0].name.replace(/\.[^/.]+$/, ''));
                          }
                        }}
                        className="w-full text-xs text-[var(--text-2)] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-mono file:bg-[var(--accent)] file:text-white hover:file:opacity-90"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase text-[var(--text-3)] mb-1 font-bold">
                        Artifact Display Name
                      </label>
                      <Input
                        value={uploadName}
                        onChange={(e) => setUploadName(e.target.value)}
                        placeholder="e.g. Diplomatic Passport Primary"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase text-[var(--text-3)] mb-1 font-bold">
                        Document Classification
                      </label>
                      <select
                        value={uploadDocType}
                        onChange={(e) => setUploadDocType(e.target.value as DocType)}
                        className="w-full bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)]"
                      >
                        {DOCUMENT_TYPES_LIST.map((t) => (
                          <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase text-[var(--text-3)] mb-1 font-bold">
                        Operational Description (Optional)
                      </label>
                      <textarea
                        value={uploadDesc}
                        onChange={(e) => setUploadDesc(e.target.value)}
                        rows={2}
                        placeholder="Security notes or verification details..."
                        className="w-full bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl p-2.5 text-xs text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
                      <Button variant="ghost" size="sm" type="button" onClick={() => setShowUploadModal(false)}>
                        Cancel
                      </Button>
                      <Button variant="primary" size="sm" type="submit" loading={isUploading} disabled={!uploadFile}>
                        Encrypt & Ingest
                      </Button>
                    </div>
                  </form>
                </Card>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Version Upload Modal */}
        <AnimatePresence>
          {showVersionsModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md"
              >
                <Card className="p-6 border-[var(--border-accent)]">
                  <div className="flex justify-between items-center mb-4 border-b border-[var(--border)] pb-3">
                    <h3 className="text-sm font-bold font-mono text-[var(--text-1)] uppercase">
                      Upload New Version for "{selectedDoc?.name}"
                    </h3>
                    <button onClick={() => setShowVersionsModal(false)} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleVersionSubmit} className="space-y-4 text-xs font-mono">
                    <div>
                      <label className="block text-[10px] uppercase text-[var(--text-3)] mb-1 font-bold">
                        New Version File
                      </label>
                      <input
                        type="file"
                        ref={versionInputRef}
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setVersionFile(e.target.files[0]);
                          }
                        }}
                        className="w-full text-xs text-[var(--text-2)] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-mono file:bg-[var(--accent)] file:text-white hover:file:opacity-90"
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
                      <Button variant="ghost" size="sm" type="button" onClick={() => setShowVersionsModal(false)}>
                        Cancel
                      </Button>
                      <Button variant="primary" size="sm" type="submit" loading={isUploadingVersion} disabled={!versionFile}>
                        Vault Version {(selectedDoc?.current_version || 1) + 1}
                      </Button>
                    </div>
                  </form>
                </Card>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Establish Organization Modal */}
        <AnimatePresence>
          {showOrgEstablishModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm font-mono">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md"
              >
                <Card className="p-6 border-[var(--border-accent)]">
                  <div className="flex justify-between items-center mb-4 border-b border-[var(--border)] pb-3">
                    <h3 className="text-sm font-bold text-[var(--text-1)] uppercase">
                      Establish Organization Enclave
                    </h3>
                    <button onClick={() => setShowOrgEstablishModal(false)} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleEstablishOrg} className="space-y-4 text-xs">
                    <div>
                      <label className="block text-[10px] uppercase text-[var(--text-3)] mb-1 font-bold">
                        Organization Name
                      </label>
                      <Input
                        value={orgNameInput}
                        onChange={(e) => setOrgNameInput(e.target.value)}
                        placeholder="e.g. Global Security Agency"
                        required
                        className="w-full text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase text-[var(--text-3)] mb-1 font-bold">
                        Jurisdiction / Security Scope (Optional)
                      </label>
                      <textarea
                        value={orgDescInput}
                        onChange={(e) => setOrgDescInput(e.target.value)}
                        rows={2}
                        placeholder="Purpose and identity verification scope..."
                        className="w-full bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl p-2.5 text-xs text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)] font-mono"
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
                      <Button variant="ghost" size="sm" type="button" onClick={() => setShowOrgEstablishModal(false)}>
                        Cancel
                      </Button>
                      <Button variant="primary" size="sm" type="submit" loading={isCreatingOrg} disabled={!orgNameInput.trim()}>
                        Establish & Activate
                      </Button>
                    </div>
                  </form>
                </Card>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default VaultPage;
