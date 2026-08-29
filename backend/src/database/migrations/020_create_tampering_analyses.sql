-- Migration: 020_create_tampering_analyses
-- Creates tables to store document tampering/forensics analysis and detailed forensic indicators

CREATE TABLE IF NOT EXISTS tampering_analyses (
  id VARCHAR(36) PRIMARY KEY,
  document_id VARCHAR(36) NOT NULL,
  version_id VARCHAR(36) NOT NULL,
  organization_id VARCHAR(36) NOT NULL,
  status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'COMPLETED',
  overall_tampering_score DECIMAL(5, 4) NOT NULL DEFAULT 0.0000, -- 0.0000 (clean) to 1.0000 (heavily tampered)
  has_tampering_detected BOOLEAN NOT NULL DEFAULT FALSE,
  analysis_metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES document_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  INDEX idx_tampering_doc_ver (document_id, version_id),
  INDEX idx_tampering_org (organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tampering_indicators (
  id VARCHAR(36) PRIMARY KEY,
  tampering_analysis_id VARCHAR(36) NOT NULL,
  category ENUM(
    'PHOTO_SUBSTITUTION',
    'TEXT_ALTERATION',
    'COMPRESSION_ANOMALY',
    'METADATA_MISMATCH',
    'EDGE_DISCONTINUITY',
    'FONT_INCONSISTENCY',
    'STAMP_IRREGULARITY'
  ) NOT NULL,
  severity ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO') NOT NULL DEFAULT 'MEDIUM',
  confidence DECIMAL(5, 4) NOT NULL DEFAULT 0.8000,
  description TEXT NOT NULL,
  evidence TEXT NULL,
  bounding_box JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tampering_analysis_id) REFERENCES tampering_analyses(id) ON DELETE CASCADE,
  INDEX idx_tampering_ind_analysis (tampering_analysis_id),
  INDEX idx_tampering_ind_cat (category),
  INDEX idx_tampering_ind_sev (severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
