// src/services/processingPipeline.service.js
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/db.js';
import { processingJobRepository } from '../repositories/processingJob.repository.js';
import { extractionRepository } from '../repositories/extraction.repository.js';
import { documentRepository } from '../repositories/document.repository.js';
import { documentVersionRepository } from '../repositories/documentVersion.repository.js';
import { storageService } from './storage.service.js';
import { DocumentExtractor } from './extractors/documentExtractor.js';
import { aiAnalysisService } from './ai/aiAnalysis.service.js';
import { auditService } from './audit.service.js';
import { AppError } from '../errors/AppError.js';
import { AUDIT_ACTIONS, PROCESSING_STATUSES } from '../config/constants.js';

export class ProcessingPipelineService {
  /**
   * Enqueue a new asynchronous document processing job
   */
  async enqueueProcessing(documentId, organizationId, actorUserId, options = {}, reqMeta = {}) {
    const doc = await documentRepository.findById(documentId, organizationId);
    if (!doc) {
      throw AppError.notFound('Document not found in organization', 'DOCUMENT_NOT_FOUND');
    }

    const versionNumber = options.versionNumber || doc.current_version;
    const version = await documentVersionRepository.findByVersionNumber(documentId, versionNumber);
    if (!version) {
      throw AppError.notFound(`Document version ${versionNumber} not found`, 'VERSION_NOT_FOUND');
    }

    const jobId = uuidv4();
    const jobType = options.jobType || 'FULL_PIPELINE';

    // 1. Create Job record & set document processing status to QUEUED
    const job = await db.transaction(async (conn) => {
      await documentRepository.updateMetadata(
        documentId,
        organizationId,
        { processingStatus: PROCESSING_STATUSES.QUEUED },
        conn
      );

      const createdJob = await processingJobRepository.create(
        {
          id: jobId,
          documentId,
          versionId: version.id,
          organizationId,
          jobType,
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 3,
        },
        conn
      );

      await auditService.log(
        {
          actorUserId,
          action: AUDIT_ACTIONS.DOCUMENT_PROCESSING_STARTED,
          resourceType: 'document_processing_job',
          resourceId: jobId,
          ipAddress: reqMeta.ip,
          userAgent: reqMeta.userAgent,
          metadata: {
            organizationId,
            documentId,
            versionId: version.id,
            jobId,
            jobType,
          },
        },
        conn
      );

      return createdJob;
    });

    // 2. Dispatch asynchronous processing (non-blocking)
    setImmediate(() => {
      this.executeJob(jobId, organizationId, actorUserId, reqMeta).catch((err) => {
        console.error(`Background job ${jobId} failed with unhandled error:`, err);
      });
    });

    return job;
  }

  /**
   * Core executor for document processing pipeline
   */
  async executeJob(jobId, organizationId, actorUserId = null, reqMeta = {}) {
    const job = await processingJobRepository.findById(jobId, organizationId);
    if (!job) return;

    const documentId = job.document_id;
    const versionId = job.version_id;

    try {
      // Step 1: Update to PROCESSING
      await processingJobRepository.updateStatus(jobId, organizationId, 'PROCESSING', {
        attempts: (job.attempts || 0) + 1,
        startedAt: new Date(),
      });
      await documentRepository.updateMetadata(documentId, organizationId, {
        processingStatus: PROCESSING_STATUSES.PROCESSING,
      });

      const doc = await documentRepository.findById(documentId, organizationId);
      const version = await documentVersionRepository.findById(versionId);

      if (!doc || !version) {
        throw new Error('Document or Version record missing during pipeline execution');
      }

      // Step 2: Retrieve file buffer from storage layer
      const fileBuffer = await storageService.getBuffer(version.storage_key);

      // Step 3: Extract text, normalize, and parse structured fields
      const extraction = await DocumentExtractor.extract(
        fileBuffer,
        version.mime_type,
        version.original_filename,
        doc.document_type
      );

      // Step 4: Persist extraction record
      const extractionId = uuidv4();
      await extractionRepository.create({
        id: extractionId,
        documentId,
        versionId,
        organizationId,
        status: 'COMPLETED',
        extractorName: extraction.extractorName,
        documentType: doc.document_type,
        rawText: extraction.rawText,
        normalizedText: extraction.normalizedText,
        extractedFields: extraction.extractedFields,
        confidenceScore: extraction.confidenceScore,
        pageCount: extraction.pageCount,
        metadata: extraction.metadata,
      });

      await auditService.log({
        actorUserId: actorUserId || doc.uploaded_by,
        action: AUDIT_ACTIONS.OCR_COMPLETED,
        resourceType: 'document_extraction',
        resourceId: extractionId,
        ipAddress: reqMeta.ip,
        userAgent: reqMeta.userAgent,
        metadata: {
          organizationId,
          documentId,
          versionId,
          confidence: extraction.confidenceScore,
          pageCount: extraction.pageCount,
        },
      });

      // Step 5: Send to AI Intelligence Layer if full pipeline requested
      if (job.job_type === 'FULL_PIPELINE' || job.job_type === 'ANALYSIS_ONLY') {
        await aiAnalysisService.runAnalysis(
          documentId,
          organizationId,
          {
            versionNumber: version.version_number,
            actorUserId: actorUserId || doc.uploaded_by,
          },
          reqMeta
        );
      }

      // Step 6: Mark pipeline as COMPLETED
      await processingJobRepository.updateStatus(jobId, organizationId, 'COMPLETED', {
        completedAt: new Date(),
      });
      await documentRepository.updateMetadata(documentId, organizationId, {
        processingStatus: PROCESSING_STATUSES.COMPLETED,
      });

      await auditService.log({
        actorUserId: actorUserId || doc.uploaded_by,
        action: AUDIT_ACTIONS.DOCUMENT_PROCESSING_COMPLETED,
        resourceType: 'document_processing_job',
        resourceId: jobId,
        ipAddress: reqMeta.ip,
        userAgent: reqMeta.userAgent,
        metadata: {
          organizationId,
          documentId,
          versionId,
          jobId,
        },
      });
    } catch (err) {
      console.error(`Pipeline failure for job ${jobId}:`, err);

      await processingJobRepository.updateStatus(jobId, organizationId, 'FAILED', {
        errorMessage: err.message,
        errorDetails: { stack: err.stack },
        failedAt: new Date(),
      });
      await documentRepository.updateMetadata(documentId, organizationId, {
        processingStatus: PROCESSING_STATUSES.FAILED,
      });

      await auditService.log({
        actorUserId,
        action: AUDIT_ACTIONS.DOCUMENT_PROCESSING_FAILED,
        resourceType: 'document_processing_job',
        resourceId: jobId,
        ipAddress: reqMeta.ip,
        userAgent: reqMeta.userAgent,
        metadata: {
          organizationId,
          documentId,
          versionId,
          error: err.message,
        },
      });
    }
  }

  /**
   * Get processing status and latest job info for a document
   */
  async getStatus(documentId, organizationId) {
    const doc = await documentRepository.findById(documentId, organizationId);
    if (!doc) {
      throw AppError.notFound('Document not found in organization', 'DOCUMENT_NOT_FOUND');
    }

    const latestJob = await processingJobRepository.findLatestByDocument(documentId, organizationId);
    const jobsHistory = await processingJobRepository.listByDocument(documentId, organizationId);

    return {
      documentId: doc.id,
      currentVersion: doc.current_version,
      processingStatus: doc.processing_status || 'UPLOADED',
      latestJob,
      jobCount: jobsHistory.length,
      history: jobsHistory,
    };
  }

  /**
   * Get extracted document content and structured fields
   */
  async getExtraction(documentId, organizationId, versionNumber = null) {
    const doc = await documentRepository.findById(documentId, organizationId);
    if (!doc) {
      throw AppError.notFound('Document not found in organization', 'DOCUMENT_NOT_FOUND');
    }

    let versionId = null;
    if (versionNumber) {
      const version = await documentVersionRepository.findByVersionNumber(documentId, versionNumber);
      if (!version) {
        throw AppError.notFound(`Version ${versionNumber} not found`, 'VERSION_NOT_FOUND');
      }
      versionId = version.id;
    }

    const extraction = await extractionRepository.findByDocument(documentId, organizationId, versionId);
    if (!extraction) {
      throw AppError.notFound('No extraction data available for this document yet', 'EXTRACTION_NOT_FOUND');
    }

    return extraction;
  }
}

export const processingPipelineService = new ProcessingPipelineService();
