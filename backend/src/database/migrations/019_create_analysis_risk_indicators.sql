-- Migration 019: Create Analysis Risk Indicators Table
CREATE TABLE IF NOT EXISTS analysis_risk_indicators (
  id VARCHAR(36) PRIMARY KEY,
  analysis_id VARCHAR(36) NOT NULL,
  document_id VARCHAR(36) NOT NULL,
  version_id VARCHAR(36) NOT NULL,
  organization_id VARCHAR(36) NOT NULL,
  indicator VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  severity ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO') NOT NULL DEFAULT 'INFO',
  confidence DECIMAL(5, 2) NOT NULL DEFAULT 1.00,
  evidence TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ari_analysis (analysis_id),
  INDEX idx_ari_doc (document_id),
  INDEX idx_ari_version (version_id),
  INDEX idx_ari_org (organization_id),
  INDEX idx_ari_severity (severity),
  FOREIGN KEY (analysis_id) REFERENCES document_analyses(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES document_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
