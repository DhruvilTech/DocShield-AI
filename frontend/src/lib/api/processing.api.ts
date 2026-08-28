// src/lib/api/processing.api.ts
import { apiClient } from './client';
import { ProcessingJob, ProcessingStatusResponse, DocumentExtraction } from '../../types';

export interface TriggerProcessingOptions {
  versionNumber?: number;
  jobType?: 'FULL_PIPELINE' | 'EXTRACTION_ONLY' | 'ANALYSIS_ONLY';
}

export const processingApi = {
  /**
   * Trigger or retry asynchronous document processing pipeline
   */
  triggerProcessing: async (
    documentId: string,
    options: TriggerProcessingOptions = {}
  ): Promise<ProcessingJob> => {
    const res = await apiClient.post<{ job: ProcessingJob }>(
      `/documents/${documentId}/process`,
      options
    );
    return res.data.job;
  },

  /**
   * Get current document processing status and job history
   */
  getProcessingStatus: async (documentId: string): Promise<ProcessingStatusResponse> => {
    const res = await apiClient.get<ProcessingStatusResponse>(
      `/documents/${documentId}/processing-status`
    );
    return res.data;
  },

  /**
   * Get raw and normalized document extraction + structured OCR fields
   */
  getExtraction: async (
    documentId: string,
    versionNumber?: number
  ): Promise<DocumentExtraction> => {
    const params = versionNumber ? { versionNumber: String(versionNumber) } : undefined;
    const res = await apiClient.get<{ extraction: DocumentExtraction }>(
      `/documents/${documentId}/extraction`,
      { params }
    );
    return res.data.extraction;
  },
};
