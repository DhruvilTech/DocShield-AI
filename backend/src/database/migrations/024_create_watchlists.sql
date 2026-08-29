-- 024_create_watchlists.sql
CREATE TABLE IF NOT EXISTS watchlists (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NULL,
    document_number VARCHAR(100) NOT NULL,
    full_name VARCHAR(255) NULL,
    nationality VARCHAR(10) NULL,
    reason VARCHAR(255) NOT NULL,
    risk_level ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'CRITICAL',
    listed_by VARCHAR(255) NOT NULL DEFAULT 'INTERPOL_SLTD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_watchlists_doc_number (document_number),
    INDEX idx_watchlists_org (organization_id),
    INDEX idx_watchlists_active (is_active),
    INDEX idx_watchlists_full_name (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
