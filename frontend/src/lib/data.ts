import { ScanResult, DocumentRecord, SecurityControl } from '../types';

/* ---- Demo scan results used on Scanner & Analysis pages ---- */
export const DEMO_SCAN_RESULTS: Record<string, ScanResult> = {
  'ma-nda': {
    documentId: 'doc-001',
    fileName: 'Acquisition_NDA_Final_v3.pdf',
    fileSize: 2_840_000,
    fileType: 'application/pdf',
    scanDuration: 1240,
    riskScore: 87,
    status: 'threat',
    pageCount: 14,
    hash: 'sha256:8f2a1c9e4b7d3f0a6e2c8b5d4f1a9e3c7b2d6f0e4a8c3b7d',
    timestamp: '2026-08-27T07:14:22Z',
    threats: [
      {
        id: 'thr-001',
        type: 'Sensitive PII Exposure',
        severity: 'critical',
        confidence: 98,
        location: 'Page 3, Section 4.2 — Party Information',
        description: 'Unmasked Social Security Number and direct banking routing code detected in cleartext.',
        recommendation: 'Apply deterministic redaction and replace with reference tokens before distribution.',
        detected: '2026-08-27T07:14:24Z',
      },
      {
        id: 'thr-002',
        type: 'Prompt Injection Payload',
        severity: 'critical',
        confidence: 94,
        location: 'Page 12, Appendix C — Embedded Hidden Text',
        description: 'Adversarial LLM jailbreak instruction embedded using zero-width Unicode characters.',
        recommendation: 'Strip adversarial payload. Do not process this document with any LLM system.',
        detected: '2026-08-27T07:14:25Z',
      },
      {
        id: 'thr-003',
        type: 'Unreleased IP Disclosure',
        severity: 'high',
        confidence: 82,
        location: 'Page 7, Patent Schedule B',
        description: 'Reference to unfiled patent application number and pending technology codename.',
        recommendation: 'Encrypt section using recipient-bound asymmetric key before external sharing.',
        detected: '2026-08-27T07:14:26Z',
      },
      {
        id: 'thr-004',
        type: 'Missing Forensic Watermark',
        severity: 'medium',
        confidence: 100,
        location: 'Document Root',
        description: 'No steganographic recipient fingerprint embedded. Cannot trace leak if distributed.',
        recommendation: 'Embed forensic watermark before any distribution.',
        detected: '2026-08-27T07:14:26Z',
      },
    ],
  },
  'healthcare': {
    documentId: 'doc-002',
    fileName: 'Patient_Genomics_Report_COV992.docx',
    fileSize: 1_180_000,
    fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    scanDuration: 890,
    riskScore: 96,
    status: 'threat',
    pageCount: 8,
    hash: 'sha256:3c7e1b9f5d2a8e4c0b6d3f9a7e1c5b8d2f6a0c4e8b3f7d1a',
    timestamp: '2026-08-27T08:31:05Z',
    threats: [
      {
        id: 'thr-005',
        type: 'HIPAA — Direct Patient Identifiers (18 PHI)',
        severity: 'critical',
        confidence: 99,
        location: 'Page 1 — Patient Demographics',
        description: 'Full name, date of birth, MRN, SSN, street address all present in cleartext.',
        recommendation: 'Apply HIPAA Safe Harbor de-identification. Remove all 18 direct identifiers.',
        detected: '2026-08-27T08:31:07Z',
      },
      {
        id: 'thr-006',
        type: 'Biometric Genetic Data Linkage',
        severity: 'critical',
        confidence: 91,
        location: 'Page 4 — Genomic Sequencing Data',
        description: 'Patient identity directly linked to BRCA1 pathogenic variant and HLA markers.',
        recommendation: 'Cryptographically decouple patient identity from genomic sequence data.',
        detected: '2026-08-27T08:31:08Z',
      },
    ],
  },
  'infrastructure': {
    documentId: 'doc-003',
    fileName: 'infra-config-prod.ts',
    fileSize: 42_000,
    fileType: 'text/typescript',
    scanDuration: 340,
    riskScore: 72,
    status: 'threat',
    pageCount: 1,
    hash: 'sha256:1b92f4d8c3a6e0b5f9d2a7c4e1b8f5d3a0c7e4b2f6d9a3c0',
    timestamp: '2026-08-27T09:05:11Z',
    threats: [
      {
        id: 'thr-007',
        type: 'Hardcoded Production Credentials',
        severity: 'critical',
        confidence: 100,
        location: 'Lines 12–18 — CLUSTER_CONFIG object',
        description: 'PostgreSQL root credentials and AWS IAM secret keys hardcoded in source.',
        recommendation: 'Rotate all exposed credentials immediately. Migrate to vault/env injection.',
        detected: '2026-08-27T09:05:13Z',
      },
      {
        id: 'thr-008',
        type: 'RSA Private Key in Source',
        severity: 'critical',
        confidence: 100,
        location: 'Line 22 — privateSigningKey constant',
        description: 'Raw RSA 4096-bit private certificate found unencrypted in version-controlled file.',
        recommendation: 'Revoke and reissue certificate. Store private keys only in HSM/key-management services.',
        detected: '2026-08-27T09:05:13Z',
      },
    ],
  },
};

/* ---- Demo vault documents ---- */
export const VAULT_DOCUMENTS: DocumentRecord[] = [
  {
    id: 'vault-001',
    name: 'Acquisition_NDA_Sanitized.pdf',
    type: 'PDF',
    size: 2_840_000,
    status: 'protected',
    uploadedAt: '2026-08-27T07:20:00Z',
    riskScore: 2,
    threatCount: 4,
    hash: 'sha256:9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f',
  },
  {
    id: 'vault-002',
    name: 'Patient_Genomics_Deidentified.docx',
    type: 'DOCX',
    size: 1_180_000,
    status: 'protected',
    uploadedAt: '2026-08-27T08:45:00Z',
    riskScore: 0,
    threatCount: 2,
    hash: 'sha256:0f1e2d3c4b5a6978869504132211009988776655443322110',
  },
  {
    id: 'vault-003',
    name: 'Q3_Earnings_Report_DRAFT.xlsx',
    type: 'XLSX',
    size: 4_200_000,
    status: 'clean',
    uploadedAt: '2026-08-27T09:12:00Z',
    riskScore: 12,
    threatCount: 0,
    hash: 'sha256:a1b2c3d4e5f67890abcdef1234567890abcdef1234567890ab',
  },
  {
    id: 'vault-004',
    name: 'infra-config-prod.ts',
    type: 'TS',
    size: 42_000,
    status: 'flagged',
    uploadedAt: '2026-08-27T09:05:00Z',
    riskScore: 72,
    threatCount: 2,
    hash: 'sha256:1b92f4d8c3a6e0b5f9d2a7c4e1b8f5d3a0c7e4b2f6d9a3c0',
  },
];

/* ---- Security Controls (SOC2/HIPAA/GDPR) ---- */
export const SECURITY_CONTROLS: SecurityControl[] = [
  {
    id: 'ctrl-001',
    category: 'Data Privacy',
    name: 'PII Detection & Redaction',
    description: 'Automated detection and tokenization of 140+ PII data types.',
    status: 'passing',
    standard: 'GDPR Art. 9 / HIPAA',
  },
  {
    id: 'ctrl-002',
    category: 'AI Security',
    name: 'Prompt Injection Firewall',
    description: 'Neural interception of adversarial LLM payloads in incoming documents.',
    status: 'passing',
    standard: 'OWASP LLM Top 10',
  },
  {
    id: 'ctrl-003',
    category: 'Forensics',
    name: 'Steganographic Watermarking',
    description: 'Invisible forensic fingerprints surviving OCR and screenshot attacks.',
    status: 'passing',
    standard: 'ISO 27001',
  },
  {
    id: 'ctrl-004',
    category: 'Infrastructure',
    name: 'Confidential Computing Enclaves',
    description: 'All document bytes processed in hardware-isolated TEE memory.',
    status: 'passing',
    standard: 'FIPS 140-3',
  },
  {
    id: 'ctrl-005',
    category: 'Compliance',
    name: 'Audit Ledger & Cryptographic Proofs',
    description: 'Immutable Merkle-tree audit trail for all document operations.',
    status: 'passing',
    standard: 'SOC 2 Type II',
  },
  {
    id: 'ctrl-006',
    category: 'Access Control',
    name: 'Zero-Trust Document Access',
    description: 'Role-bound encryption keys with time-limited access tokens.',
    status: 'partial',
    standard: 'NIST 800-53',
  },
  {
    id: 'ctrl-007',
    category: 'Incident Response',
    name: 'Real-time Threat Alerting',
    description: 'Sub-second alerting for critical threat detections via webhooks.',
    status: 'passing',
    standard: 'SOC 2 Type II',
  },
  {
    id: 'ctrl-008',
    category: 'Data Residency',
    name: 'EU Data Sovereignty',
    description: 'Configurable regional data processing and storage boundaries.',
    status: 'partial',
    standard: 'GDPR Art. 44-49',
  },
];

/* Format file size */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* Risk score label */
export function getRiskLabel(score: number): string {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Medium';
  if (score >= 20) return 'Low';
  return 'Safe';
}

/* Severity color token */
export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'var(--threat)';
    case 'high':     return '#F97316';
    case 'medium':   return 'var(--warning)';
    case 'low':      return 'var(--info)';
    default:         return 'var(--text-2)';
  }
}
