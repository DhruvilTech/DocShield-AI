/* === DocShield AI — Core Type System === */

export type Theme = 'dark' | 'light';

export type ThreatSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ScanStatus = 'idle' | 'uploading' | 'processing' | 'analyzing' | 'complete' | 'error';
export type DocumentStatus = 'pending' | 'clean' | 'threat' | 'protected' | 'flagged';

export interface NavItem {
  label: string;
  path: string;
  icon?: string;
  badge?: string;
  children?: NavItem[];
}

export interface Threat {
  id: string;
  type: string;
  severity: ThreatSeverity;
  confidence: number;        // 0–100
  location: string;          // Page, section, or field description
  description: string;
  recommendation: string;
  detected: string;          // ISO timestamp
}

export interface ScanResult {
  documentId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  scanDuration: number;      // milliseconds
  riskScore: number;         // 0–100
  status: DocumentStatus;
  threats: Threat[];
  pageCount?: number;
  hash: string;
  timestamp: string;
}

export interface DocumentRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  status: DocumentStatus;
  uploadedAt: string;
  riskScore: number;
  threatCount: number;
  hash: string;
}

export interface SecurityControl {
  id: string;
  category: string;
  name: string;
  description: string;
  status: 'passing' | 'failing' | 'partial' | 'na';
  standard: string;          // e.g. "SOC2", "HIPAA", "GDPR"
}

export interface MetricCard {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'flat';
  status?: 'safe' | 'warning' | 'threat' | 'info';
}

/* ---- User & Authentication Types ---- */
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: UserStatus;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: string[];
  permissions: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export interface Role {
  id: string;
  name: string;
  slug: string;
  description: string;
  isSystem: boolean;
  permissions?: Permission[];
}

export interface Permission {
  id: string;
  slug: string;
  resource: string;
  action: string;
  description: string;
}

export interface AuditLog {
  id: string;
  actorUserId?: string | null;
  actor_user_id?: string | null;
  actorName?: string;
  actor_name?: string;
  actorEmail?: string;
  actor_email?: string;
  action: string;
  resourceType?: string;
  resource_type?: string;
  resourceId?: string | null;
  resource_id?: string | null;
  description?: string;
  metadata: Record<string, any> | null;
  ipAddress?: string | null;
  ip_address?: string | null;
  userAgent?: string | null;
  user_agent?: string | null;
  createdAt?: string;
  created_at?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/* ---- Organization & Multi-Tenancy Types ---- */
export type OrganizationStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: OrganizationStatus;
  settings: Record<string, any> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  role_name?: string;
  role_slug?: string;
  permissions?: string[];
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role_id: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  joined_at: string;
  user_name: string;
  user_email: string;
  name?: string;
  email?: string;
  membership_status?: string;
  avatar_url: string | null;
  role_name: string;
  role_slug: string;
}

export interface OrganizationInvitation {
  id: string;
  organization_id: string;
  organization_name?: string;
  email: string;
  role_id: string;
  role_name?: string;
  inviter_name?: string;
  accepted_at?: string;
  revoked_at?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expires_at: string;
  created_at: string;
}

/* ---- Document & Secure Storage Types ---- */
export type DocType =
  | 'PASSPORT'
  | 'VISA'
  | 'NATIONAL_ID'
  | 'DRIVING_LICENSE'
  | 'DRIVERS_LICENSE'
  | 'PERMIT'
  | 'CONTRACT'
  | 'INVOICE'
  | 'FINANCIAL_STATEMENT'
  | 'SECURITY_CLEARANCE'
  | 'LEGAL_BRIEF'
  | 'OTHER';

export type DocumentProcessingStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'PROCESSING' | 'FLAGGED';
export type ProcessingStatus = 'UPLOADED' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface VaultDocument {
  id: string;
  organization_id: string;
  uploaded_by: string;
  name: string;
  document_type: DocType;
  status: DocumentProcessingStatus;
  current_version: number;
  processing_status: ProcessingStatus;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  original_filename?: string;
  storage_key?: string;
  current_checksum?: string;
  uploader_name?: string;
  file_size?: number;
  mime_type?: string;
  checksum?: string;
  extraction_status?: ProcessingStatus;
  extraction_confidence?: number;
  extracted_fields?: Record<string, any>;
  has_tampering?: boolean;
  tampering_score?: number;
  face_status?: string;
  face_similarity?: number;
  risk_score?: number;
  risk_level?: RiskLevel;
  screening_verdict?: ScreeningVerdict;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  storage_key: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  checksum: string;
  uploaded_by: string;
  change_summary: string | null;
  created_at: string;
}

/* ---- Document Processing & Extractions ---- */
export interface ProcessingJob {
  id: string;
  document_id: string;
  version_id: string;
  organization_id: string;
  status: ProcessingStatus;
  progress_percent: number;
  current_stage: string | null;
  error_message: string | null;
  processing_metadata: Record<string, any> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ProcessingStatusResponse {
  documentId: string;
  currentVersion: number;
  processingStatus: ProcessingStatus;
  latestJob: ProcessingJob | null;
  jobCount: number;
  history: ProcessingJob[];
}

export interface DocumentExtraction {
  id: string;
  document_id: string;
  version_id: string;
  organization_id: string;
  raw_text: string | null;
  normalized_text: string | null;
  extracted_fields: {
    // Passport Fields (P8 Module 1)
    fullName?: { value: string | null; confidence: number };
    passportNumber?: { value: string | null; confidence: number };
    nationality?: { value: string | null; confidence: number };
    dateOfBirth?: { value: string | null; confidence: number };
    dateOfExpiry?: { value: string | null; confidence: number };
    gender?: { value: string | null; confidence: number };
    issuingCountry?: { value: string | null; confidence: number };
    mrzLines?: { value: string[]; confidence: number };
    mrzValidation?: {
      value: {
        isValid: boolean;
        docNumberCheck?: { expected: number; actual: string; valid: boolean };
        dobCheck?: { expected: number; actual: string; valid: boolean };
        expiryCheck?: { expected: number; actual: string; valid: boolean };
        errors: string[];
      };
      confidence: number;
    };

    // Visa Fields (P8 Module 1)
    visaNumber?: { value: string | null; confidence: number };
    visaType?: { value: string | null; confidence: number };
    entryValidation?: { value: string | null; confidence: number };
    stayDuration?: { value: string | null; confidence: number };
    validFrom?: { value: string | null; confidence: number };
    validUntil?: { value: string | null; confidence: number };
    holderName?: { value: string | null; confidence: number };

    // National ID & Driving License Fields
    idNumber?: { value: string | null; confidence: number };
    licenseClass?: { value: string | null; confidence: number };
    dateOfIssue?: { value: string | null; confidence: number };
    address?: { value: string | null; confidence: number };

    // Permit & Border Authorization Fields
    permitNumber?: { value: string | null; confidence: number };
    permitType?: { value: string | null; confidence: number };
    authorizedPort?: { value: string | null; confidence: number };
    issuingAuthority?: { value: string | null; confidence: number };
    employerOrSponsor?: { value: string | null; confidence: number };
    [key: string]: any;
  } | null;
  confidence_score: number;
  extractor_name: string;
  page_count: number;
  created_at: string;
}

/* ---- AI Document Intelligence & Findings ---- */
export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface AnalysisFinding {
  id: string;
  analysis_id: string;
  category: 'IDENTITY' | 'TAMPERING' | 'COMPLIANCE' | 'SECURITY' | 'INJECTION' | 'PII' | 'DOCUMENT' | 'VALIDATION';
  severity: FindingSeverity;
  title: string;
  description: string;
  evidence: string | null;
  confidence: number;
  location: string | null;
  created_at: string;
}

export interface RiskIndicator {
  id: string;
  analysis_id: string;
  indicator: string;
  category: string;
  severity: FindingSeverity;
  confidence: number;
  evidence: string | null;
  created_at: string;
}

export interface DocumentAnalysis {
  id: string;
  document_id: string;
  version_id: string;
  organization_id: string;
  ai_provider: string;
  model_name: string;
  overall_risk_score: number;
  summary: string;
  recommendations: string[];
  findings_count: number;
  analyzed_at: string;
  duration_ms: number;
  findings?: AnalysisFinding[];
  riskIndicators?: RiskIndicator[];
  risk_indicators?: RiskIndicator[];
  provider?: string;
  model?: string;
  confidence?: number;
}

/* ---- Tampering Forensics & Face Verification ---- */
export type TamperingCategory =
  | 'PHOTO_SUBSTITUTION'
  | 'TEXT_ALTERATION'
  | 'COMPRESSION_ANOMALY'
  | 'METADATA_MISMATCH'
  | 'EDGE_DISCONTINUITY'
  | 'FONT_INCONSISTENCY'
  | 'STAMP_IRREGULARITY'
  | 'STAMP_FORGERY';

export interface TamperingIndicator {
  id: string;
  tampering_analysis_id: string;
  category: TamperingCategory;
  severity: FindingSeverity;
  confidence: number;
  description: string;
  evidence: string | null;
  bounding_box: { x: number; y: number; width: number; height: number } | null;
  created_at: string;
}

export interface TamperingAnalysis {
  id: string;
  document_id: string;
  version_id: string;
  organization_id: string;
  status: string;
  overall_tampering_score: number;
  has_tampering_detected: boolean;
  analysis_metadata: {
    analyzedAt?: string;
    durationMs?: number;
    fileSize?: number;
    mimeType?: string;
    totalIndicators?: number;
    checksumVerified?: boolean;
    forensicEngine?: string;
    useCaseCoverage?: {
      photoReplacement: boolean;
      textManipulation: boolean;
      stampForgery: boolean;
      imageMetadataAnalysis: boolean;
    };
  } | null;
  created_at: string;
  updated_at: string;
  indicators?: TamperingIndicator[];
}

export type FaceVerificationStatus = 'MATCH' | 'NO_MATCH' | 'INCONCLUSIVE' | 'NO_FACE_DETECTED';

export interface FaceVerification {
  id: string;
  document_id: string;
  version_id: string;
  organization_id: string;
  status: FaceVerificationStatus;
  similarity_score: number;
  confidence: number;
  match_threshold: number;
  model_name: string;
  face_detected_in_doc: boolean;
  reference_face_provided: boolean;
  processing_time_ms: number;
  metadata: {
    faceBoundingBox?: { x: number; y: number; width: number; height: number };
    facialLandmarksDetected?: number;
    illuminationScore?: number;
    similarity?: number;
    match?: boolean;
    confidence?: number;
    threshold?: number;
    liveness?: {
      status: 'PASS' | 'FAIL';
      confidence?: number;
      reason?: string | null;
      stages_completed?: string[];
    };
    doc_quality?: {
      brightness?: number;
      sharpness?: number;
      face_width?: number;
      face_height?: number;
      confidence?: number;
      is_valid?: boolean;
      rejection_reason?: string | null;
    };
    live_quality?: {
      brightness?: number;
      sharpness?: number;
      face_width?: number;
      face_height?: number;
      confidence?: number;
      is_valid?: boolean;
      rejection_reason?: string | null;
    };
    face_count?: { doc: number; live: number };
    rejectionReason?: string | null;
    rejectionError?: { code?: string; message?: string; details?: any } | null;
    note?: string;
  } | null;
  created_at: string;
}

/* ---- Risk Scoring & Screening Intelligence ---- */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskScore {
  id: string;
  document_id: string;
  version_id: string;
  organization_id: string;
  risk_score: number;
  risk_level: RiskLevel;
  confidence: number;
  scoring_model_version: string;
  score_breakdown: {
    tamperingScore: number;
    validationScore: number;
    biometricScore: number;
    ocrQualityScore: number;
  };
  explanation: string;
  created_at: string;
  updated_at: string;
}

export type ScreeningVerdict = 'PASSED' | 'REVIEW_REQUIRED' | 'REJECTED';

export interface ScreeningFactor {
  id: string;
  screening_id: string;
  category: 'IDENTITY' | 'TAMPERING' | 'BIOMETRIC' | 'COMPLIANCE' | 'ANOMALY';
  severity: FindingSeverity;
  title: string;
  description: string;
  impact_score: number;
  evidence: string | null;
  created_at: string;
}

export interface DocumentScreening {
  id: string;
  document_id: string;
  version_id: string;
  organization_id: string;
  status: string;
  overall_risk_score: number;
  overall_risk_level: RiskLevel;
  verdict: ScreeningVerdict;
  summary: string;
  recommendations: string[];
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  factors?: ScreeningFactor[];
}

/* ---- Border Watchlist & Stolen Document Database ---- */
export interface WatchlistEntry {
  id: string;
  organization_id: string | null;
  document_number: string;
  full_name: string | null;
  nationality: string | null;
  reason: string;
  risk_level: RiskLevel;
  listed_by: string;
  is_active: boolean;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}
