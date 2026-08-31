-- Migration: 026_add_skipped_status_to_analyses
-- Alters status columns in tampering_analyses and face_verifications to add 'SKIPPED' to their respective ENUM definitions.

ALTER TABLE tampering_analyses 
  MODIFY COLUMN status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'COMPLETED';

ALTER TABLE face_verifications 
  MODIFY COLUMN status ENUM('MATCH', 'NO_MATCH', 'INCONCLUSIVE', 'NO_FACE_DETECTED', 'SKIPPED') NOT NULL DEFAULT 'INCONCLUSIVE';
