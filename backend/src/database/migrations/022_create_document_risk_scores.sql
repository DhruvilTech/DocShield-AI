-- Migration: 022_create_document_risk_scores
-- Creates table to store deterministic multi-signal risk assessments

CREATE TABLE IF NOT EXISTS document_risk_scores (
  id VARCHAR(36) PRIMARY KEY,
  document_id VARCHAR(36) NOT NULL,
  version_id VARCHAR(36) NOT NULL,
  organization_id VARCHAR(36) NOT NULL,
  risk_score INT UNSIGNED NOT NULL DEFAULT 0, -- 0 to 100
  risk_level ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'LOW',
  confidence DECIMAL(5, 4) NOT NULL DEFAULT 0.9000,
  scoring_model_version VARCHAR(50) NOT NULL DEFAULT 'risk-engine-v2',
  score_breakdown JSON NOT NULL, -- { tamperingScore, ocrScore, validationScore, biometricScore }
  explanation TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES document_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  INDEX idx_risk_doc_ver (document_id, version_id),
  INDEX idx_risk_org (organization_id),
  INDEX idx_risk_level (risk_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
