-- Migration 028: Add AES-256-GCM encryption and Cloudinary metadata to document_versions
ALTER TABLE document_versions
  ADD COLUMN iv VARCHAR(64) NULL AFTER checksum,
  ADD COLUMN auth_tag VARCHAR(64) NULL AFTER iv,
  ADD COLUMN encryption_algorithm VARCHAR(32) NOT NULL DEFAULT 'AES-256-GCM' AFTER auth_tag,
  ADD COLUMN key_version VARCHAR(32) NOT NULL DEFAULT 'v1' AFTER encryption_algorithm,
  ADD COLUMN is_encrypted BOOLEAN NOT NULL DEFAULT TRUE AFTER key_version,
  ADD COLUMN cloudinary_public_id VARCHAR(255) NULL AFTER is_encrypted;
