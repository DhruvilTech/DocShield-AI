-- Migration: 023_create_document_screenings
-- Creates table to store unified document screening intelligence, verdict, and factors

CREATE TABLE IF NOT EXISTS document_screenings (
  id VARCHAR(36) PRIMARY KEY,
  document_id VARCHAR(36) NOT NULL,
  version_id VARCHAR(36) NOT NULL,
  organization_id VARCHAR(36) NOT NULL,
  status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'COMPLETED',
  overall_risk_score INT UNSIGNED NOT NULL DEFAULT 0,
  overall_risk_level ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'LOW',
  verdict ENUM('PASSED', 'REVIEW_REQUIRED', 'REJECTED') NOT NULL DEFAULT 'PASSED',
  summary TEXT NOT NULL,
  recommendations JSON NOT NULL, -- list of string recommendations
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES document_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  INDEX idx_screening_doc_ver (document_id, version_id),
  INDEX idx_screening_org (organization_id),
  INDEX idx_screening_verdict (verdict)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS screening_factors (
  id VARCHAR(36) PRIMARY KEY,
  screening_id VARCHAR(36) NOT NULL,
  category ENUM('IDENTITY', 'TAMPERING', 'BIOMETRIC', 'COMPLIANCE', 'ANOMALY') NOT NULL,
  severity ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO') NOT NULL DEFAULT 'INFO',
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  impact_score INT NOT NULL DEFAULT 0, -- impact towards overall risk
  evidence TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (screening_id) REFERENCES document_screenings(id) ON DELETE CASCADE,
  INDEX idx_factor_screening (screening_id),
  INDEX idx_factor_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
