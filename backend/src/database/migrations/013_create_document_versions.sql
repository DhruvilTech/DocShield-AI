-- Migration 013: Create Document Versions Table
CREATE TABLE IF NOT EXISTS document_versions (
  id VARCHAR(36) PRIMARY KEY,
  document_id VARCHAR(36) NOT NULL,
  version_number INT NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  iv VARCHAR(64) NULL,
  auth_tag VARCHAR(64) NULL,
  encryption_algorithm VARCHAR(32) NOT NULL DEFAULT 'AES-256-GCM',
  key_version VARCHAR(32) NOT NULL DEFAULT 'v1',
  is_encrypted BOOLEAN NOT NULL DEFAULT TRUE,
  cloudinary_public_id VARCHAR(255) NULL,
  uploaded_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_doc_version (document_id, version_number),
  INDEX idx_doc_version_doc (document_id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

