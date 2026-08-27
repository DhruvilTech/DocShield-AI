/* === DocShield AI — Core Type System === */

export type Theme = 'dark' | 'light';

export type ThreatSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ScanStatus = 'idle' | 'uploading' | 'processing' | 'analyzing' | 'complete' | 'error';
export type DocumentStatus = 'pending' | 'clean' | 'threat' | 'protected' | 'flagged';

export interface NavItem {
  label: string;
  path: string;
  icon?: string;
  badge?: string;
  children?: NavItem[];
}

export interface Threat {
  id: string;
  type: string;
  severity: ThreatSeverity;
  confidence: number;        // 0–100
  location: string;          // Page, section, or field description
  description: string;
  recommendation: string;
  detected: string;          // ISO timestamp
}

export interface ScanResult {
  documentId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  scanDuration: number;      // milliseconds
  riskScore: number;         // 0–100
  status: DocumentStatus;
  threats: Threat[];
  pageCount?: number;
  hash: string;
  timestamp: string;
}

export interface DocumentRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  status: DocumentStatus;
  uploadedAt: string;
  riskScore: number;
  threatCount: number;
  hash: string;
}

export interface SecurityControl {
  id: string;
  category: string;
  name: string;
  description: string;
  status: 'passing' | 'failing' | 'partial' | 'na';
  standard: string;          // e.g. "SOC2", "HIPAA", "GDPR"
}

export interface MetricCard {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'flat';
  status?: 'safe' | 'warning' | 'threat' | 'info';
}
