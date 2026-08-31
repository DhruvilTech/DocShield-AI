// src/services/verification/documentStage.service.js
import { aiClient } from '../ai/aiClient.js';
import { storageService } from '../storage.service.js';
import { documentRepository } from '../../repositories/document.repository.js';
import { documentVersionRepository } from '../../repositories/documentVersion.repository.js';
import { extractionRepository } from '../../repositories/extraction.repository.js';
import { AppError } from '../../errors/AppError.js';
import crypto from 'crypto';

export class DocumentStageService {
  /**
   * Run Stage 1 Document Detection on the uploaded file
   */
  async execute(documentId, organizationId, options = {}) {
    const doc = await documentRepository.findById(documentId, organizationId);
    if (!doc) {
      throw AppError.notFound('Document not found in organization', 'DOCUMENT_NOT_FOUND');
    }

    const targetVersionNumber = options.versionNumber || doc.current_version;
    const version = await documentVersionRepository.findByVersionNumber(documentId, targetVersionNumber);
    if (!version) {
      throw AppError.notFound(`Version ${targetVersionNumber} not found`, 'VERSION_NOT_FOUND');
    }

    // 1. Retrieve binary document buffer
    const fileBuffer = await storageService.getBuffer(version.storage_key);

    try {
      // 2. Call FastAPI document screening
      const result = await aiClient.analyzeDocument(
        fileBuffer,
        version.original_filename,
        version.mime_type,
        doc.document_type
      );

      const detectedType = result.document_type;
      const isSupported = detectedType && detectedType.toLowerCase() !== 'unknown' && detectedType.toLowerCase() === doc.document_type.toLowerCase();

      // 3. Persist extraction record to DB so downstream services can access it
      await extractionRepository.create({
        id: crypto.randomUUID(),
        documentId,
        versionId: version.id,
        organizationId,
        status: 'COMPLETED',
        extractorName: 'FastAPI-PaddleOCR',
        documentType: doc.document_type,
        rawText: result.ocr?.raw_text || '',
        normalizedText: result.ocr?.raw_text || '',
        extractedFields: result.extracted_fields || {},
        confidenceScore: result.ocr?.confidence || 0.95,
        pageCount: 1,
        metadata: {
          engine_used: result.ocr?.engine_used,
          validation: result.validation
        }
      });

      return {
        status: isSupported ? 'passed' : 'failed',
        should_continue: isSupported,
        document_type: detectedType || doc.document_type,
        confidence: result.ocr?.confidence ?? 0.95,
        reason: isSupported ? null : 'Uploaded file could not be verified as a supported document',
        result: result
      };
    } catch (err) {
      throw AppError.internal(`FastAPI Document Detection Stage failed: ${err.message}`, 'DOCUMENT_DETECTION_FAILED');
    }
  }
}

export const documentStageService = new DocumentStageService();
