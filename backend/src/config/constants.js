// src/config/constants.js

export const COOKIE_OPTIONS = {
  REFRESH_TOKEN: 'docshield_refresh_token',
};

export const REFRESH_COOKIE_CONFIG = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_-])[A-Za-z\d@$!%*?&#^()_-]{8,}$/;
export const PASSWORD_REQUIREMENT_MSG = 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.';

export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'super_admin',
  SCREENING_OFFICER: 'screening_officer',
  INVESTIGATOR: 'investigator',
  ANALYST_VIEWER: 'analyst_viewer',
};

export const SYSTEM_PERMISSIONS = {
  // Users
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  
  // Roles & Permissions
  ROLES_READ: 'roles:read',
  ROLES_ASSIGN: 'roles:assign',
  PERMISSIONS_READ: 'permissions:read',

  // Organizations
  ORGANIZATIONS_READ: 'organizations:read',
  ORGANIZATIONS_CREATE: 'organizations:create',
  ORGANIZATIONS_UPDATE: 'organizations:update',
  ORGANIZATIONS_DELETE: 'organizations:delete',
  ORGANIZATIONS_MANAGE_MEMBERS: 'organizations:manage_members',
  ORGANIZATIONS_INVITE: 'organizations:invite',
  
  // Documents & Screening
  DOCUMENTS_READ: 'documents:read',
  DOCUMENTS_CREATE: 'documents:create',
  DOCUMENTS_UPDATE: 'documents:update',
  DOCUMENTS_DELETE: 'documents:delete',
  DOCUMENTS_DOWNLOAD: 'documents:download',
  DOCUMENTS_UPLOAD_VERSION: 'documents:upload_version',
  DOCUMENTS_VIEW_VERSIONS: 'documents:view_versions',
  DOCUMENTS_ARCHIVE: 'documents:archive',
  SCREENING_RUN: 'screening:run',
  SCREENING_READ: 'screening:read',
  
  // Forensics & Threats
  FORENSICS_READ: 'forensics:read',
  FORENSICS_ANALYZE: 'forensics:analyze',
  THREATS_READ: 'threats:read',
  THREATS_MANAGE: 'threats:manage',
  
  // Vault & Reports
  VAULT_READ: 'vault:read',
  VAULT_MANAGE: 'vault:manage',
  REPORTS_READ: 'reports:read',
  REPORTS_CREATE: 'reports:create',
  
  // Audit Trail
  AUDIT_LOGS_READ: 'audit_logs:read',
};

export const DOCUMENT_TYPES = {
  PASSPORT: 'PASSPORT',
  VISA: 'VISA',
  NATIONAL_ID: 'NATIONAL_ID',
  DRIVING_LICENSE: 'DRIVING_LICENSE',
  PERMIT: 'PERMIT',
  OTHER: 'OTHER',
};

export const DOCUMENT_STATUSES = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  DELETED: 'DELETED',
  PROCESSING: 'PROCESSING',
};

export const ORGANIZATION_STATUSES = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
};

export const UPLOAD_LIMITS = {
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024, // 50MB
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/tiff',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ],
  ALLOWED_EXTENSIONS: ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.docx', '.doc'],
};

export const AUDIT_ACTIONS = {
  // Authentication
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  REGISTER: 'REGISTER',
  TOKEN_REFRESH: 'TOKEN_REFRESH',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  EMAIL_VERIFICATION_SENT: 'EMAIL_VERIFICATION_SENT',
  EMAIL_VERIFIED: 'EMAIL_VERIFIED',

  // User Management
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',

  // Organizations & Memberships
  ORGANIZATION_CREATED: 'ORGANIZATION_CREATED',
  ORGANIZATION_UPDATED: 'ORGANIZATION_UPDATED',
  ORGANIZATION_DELETED: 'ORGANIZATION_DELETED',
  MEMBER_ADDED: 'MEMBER_ADDED',
  MEMBER_ROLE_UPDATED: 'MEMBER_ROLE_UPDATED',
  MEMBER_REMOVED: 'MEMBER_REMOVED',
  INVITATION_CREATED: 'INVITATION_CREATED',
  INVITATION_ACCEPTED: 'INVITATION_ACCEPTED',
  INVITATION_REVOKED: 'INVITATION_REVOKED',

  // Documents
  DOCUMENT_CREATED: 'DOCUMENT_CREATED',
  DOCUMENT_VIEWED: 'DOCUMENT_VIEWED',
  DOCUMENT_DOWNLOADED: 'DOCUMENT_DOWNLOADED',
  DOCUMENT_UPDATED: 'DOCUMENT_UPDATED',
  DOCUMENT_VERSION_CREATED: 'DOCUMENT_VERSION_CREATED',
  DOCUMENT_ARCHIVED: 'DOCUMENT_ARCHIVED',
  DOCUMENT_DELETED: 'DOCUMENT_DELETED',
  DOCUMENT_ACCESS_DENIED: 'DOCUMENT_ACCESS_DENIED',

  // RBAC
  ROLE_ASSIGNED: 'ROLE_ASSIGNED',
  ROLE_REMOVED: 'ROLE_REMOVED',
  ROLE_CREATED: 'ROLE_CREATED',
  ROLE_UPDATED: 'ROLE_UPDATED',
  ROLE_PERMISSIONS_UPDATED: 'ROLE_PERMISSIONS_UPDATED',

  // Screening & Forensics
  SCREENING_EXECUTED: 'SCREENING_EXECUTED',
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  THREAT_FLAGGED: 'THREAT_FLAGGED',
  REPORT_GENERATED: 'REPORT_GENERATED',
};

