-- Migration 014: Add processing_status to documents table
ALTER TABLE documents
ADD COLUMN processing_status ENUM('UPLOADED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'UPLOADED' AFTER status,
ADD INDEX idx_doc_processing_status (processing_status);
