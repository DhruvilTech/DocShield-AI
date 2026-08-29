-- Migration: 021_create_face_verifications
-- Creates table to store biometric face detection and verification results

CREATE TABLE IF NOT EXISTS face_verifications (
  id VARCHAR(36) PRIMARY KEY,
  document_id VARCHAR(36) NOT NULL,
  version_id VARCHAR(36) NOT NULL,
  organization_id VARCHAR(36) NOT NULL,
  status ENUM('MATCH', 'NO_MATCH', 'INCONCLUSIVE', 'NO_FACE_DETECTED') NOT NULL DEFAULT 'INCONCLUSIVE',
  similarity_score DECIMAL(5, 4) NOT NULL DEFAULT 0.0000, -- 0.0000 to 1.0000
  confidence DECIMAL(5, 4) NOT NULL DEFAULT 0.0000,
  match_threshold DECIMAL(5, 4) NOT NULL DEFAULT 0.7500,
  model_name VARCHAR(100) NOT NULL DEFAULT 'docshield-facenet-v1',
  face_detected_in_doc BOOLEAN NOT NULL DEFAULT FALSE,
  reference_face_provided BOOLEAN NOT NULL DEFAULT FALSE,
  processing_time_ms INT UNSIGNED NOT NULL DEFAULT 0,
  metadata JSON NULL,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES document_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  INDEX idx_face_doc_ver (document_id, version_id),
  INDEX idx_face_org (organization_id),
  INDEX idx_face_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
