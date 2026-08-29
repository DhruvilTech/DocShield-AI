-- Migration: 025_update_face_verifications_timestamp
-- Updates created_at column to support microsecond precision

ALTER TABLE face_verifications MODIFY COLUMN created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6);
