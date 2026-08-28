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
  description: string | null;
  is_system: boolean;
  permissions?: Permission[];
}

export interface Permission {
  id: string;
  slug: string;
  resource: string;
  action: string;
  description: string | null;
}

export interface AuditLog {
  id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  actor_name?: string | null;
  actor_email?: string | null;
}

/* ---- Organization & Tenant Types ---- */
export type OrganizationStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  status: OrganizationStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  role_id?: string;
  role_name?: string;
  role_slug?: string;
  member_status?: string;
  joined_at?: string;
  member_count?: number;
  document_count?: number;
}

export interface OrganizationMember {
  membership_id: string;
  membership_status: string;
  joined_at: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  user_status: UserStatus;
  role_id: string;
  role_name: string;
  role_slug: string;
}

export interface OrganizationInvitation {
  id: string;
  organization_id: string;
  organization_name?: string;
  organization_slug?: string;
  email: string;
  role_id: string;
  role_name?: string;
  role_slug?: string;
  invited_by: string;
  inviter_name?: string;
  inviter_email?: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

/* ---- Document & Versioning Types ---- */
export type DocType = 'PASSPORT' | 'VISA' | 'NATIONAL_ID' | 'DRIVERS_LICENSE' | 'CONTRACT' | 'INVOICE' | 'FINANCIAL_STATEMENT' | 'SECURITY_CLEARANCE' | 'LEGAL_BRIEF' | 'OTHER';
export type DocStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'FLAGGED';

export interface VaultDocument {
  id: string;
  organization_id: string;
  uploaded_by: string;
  name: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  storage_key: string;
  document_type: DocType;
  status: DocStatus;
  description: string | null;
  current_version: number;
  created_at: string;
  updated_at: string;
  uploader_name?: string;
  uploader_email?: string;
  current_checksum?: string;
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
  created_at: string;
  uploader_name?: string;
  uploader_email?: string;
}


