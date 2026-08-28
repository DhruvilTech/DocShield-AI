-- Migration 012: Create Documents Table
CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  uploaded_by VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  document_type ENUM('PASSPORT', 'VISA', 'NATIONAL_ID', 'DRIVING_LICENSE', 'PERMIT', 'OTHER') NOT NULL DEFAULT 'OTHER',
  status ENUM('ACTIVE', 'ARCHIVED', 'DELETED', 'PROCESSING') NOT NULL DEFAULT 'ACTIVE',
  description TEXT NULL,
  current_version INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  INDEX idx_doc_org (organization_id),
  INDEX idx_doc_status (status),
  INDEX idx_doc_type (document_type),
  INDEX idx_doc_created (created_at),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
