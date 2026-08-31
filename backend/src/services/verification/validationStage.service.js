// src/services/verification/validationStage.service.js
import { documentValidationService } from '../validation/documentValidation.service.js';
import { extractionRepository } from '../../repositories/extraction.repository.js';
import { documentRepository } from '../../repositories/document.repository.js';
import { documentVersionRepository } from '../../repositories/documentVersion.repository.js';
import { AppError } from '../../errors/AppError.js';

export class ValidationStageService {
  /**
   * Run Stage 2: Document Standards, Checksums, Format & Watchlist Validation
   */
  async execute(documentId, organizationId, options = {}, reqMeta = {}) {
    const doc = await documentRepository.findById(documentId, organizationId);
    if (!doc) {
      throw AppError.notFound('Document not found in organization', 'DOCUMENT_NOT_FOUND');
    }

    const targetVersionNumber = options.versionNumber || doc.current_version;
    const version = await documentVersionRepository.findByVersionNumber(documentId, targetVersionNumber);
    if (!version) {
      throw AppError.notFound(`Version ${targetVersionNumber} not found`, 'VERSION_NOT_FOUND');
    }

    const extraction = await extractionRepository.findByDocument(documentId, organizationId, version.id);
    if (!extraction || !extraction.extracted_fields) {
      return {
        status: 'failed',
        should_continue: false,
        confidence: 0.0,
        reason: 'Extraction data required for document validation is missing.',
        result: null,
      };
    }

    const valResult = await documentValidationService.validateDocument(
      extraction.extracted_fields,
      doc.document_type,
      organizationId,
      reqMeta
    );

    const isPassed = valResult.isValid;
    const failureFinding = valResult.findings?.find((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
    const reason = !isPassed ? (failureFinding?.description || 'Document failed official format and validation standards.') : null;

    return {
      status: isPassed ? 'passed' : 'failed',
      should_continue: isPassed,
      confidence: isPassed ? 0.95 : 0.20,
      reason,
      result: valResult,
    };
  }
}

export const validationStageService = new ValidationStageService();
