// src/services/ai/aiAnalysis.service.js
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/db.js';
import { analysisRepository } from '../../repositories/analysis.repository.js';
import { documentRepository } from '../../repositories/document.repository.js';
import { documentVersionRepository } from '../../repositories/documentVersion.repository.js';
import { extractionRepository } from '../../repositories/extraction.repository.js';
import { auditService } from '../audit.service.js';
import { AiPromptService } from './aiPrompt.service.js';
import { AiSchemaValidator } from './aiSchema.validator.js';
import { AiProviderFactory } from './providers/providerFactory.js';
import { AppError } from '../../errors/AppError.js';
import { AUDIT_ACTIONS } from '../../config/constants.js';

export class AiAnalysisService {
  /**
   * Run AI document intelligence analysis on extracted document content
   */
  async runAnalysis(documentId, organizationId, options = {}, reqMeta = {}) {
    const doc = await documentRepository.findById(documentId, organizationId);
    if (!doc) {
      throw AppError.notFound('Document not found in organization', 'DOCUMENT_NOT_FOUND');
    }

    const targetVersionNumber = options.versionNumber || doc.current_version;
    const version = await documentVersionRepository.findByVersionNumber(documentId, targetVersionNumber);
    if (!version) {
      throw AppError.notFound(`Version ${targetVersionNumber} not found`, 'VERSION_NOT_FOUND');
    }

    // 1. Fetch latest extraction record for this version
    const extraction = await extractionRepository.findByDocument(documentId, organizationId, version.id);
    if (!extraction) {
      throw AppError.badRequest('No text extraction found for this document version. Run extraction first.', 'EXTRACTION_REQUIRED');
    }

    const actorUserId = options.actorUserId || doc.uploaded_by;

    // 2. Audit start
    await auditService.log({
      actorUserId,
      action: AUDIT_ACTIONS.AI_ANALYSIS_STARTED,
      resourceType: 'document_analysis',
      resourceId: documentId,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      metadata: {
        organizationId,
        documentId,
        versionId: version.id,
        versionNumber: targetVersionNumber,
      },
    });

    const startTime = Date.now();
    const provider = AiProviderFactory.getProvider(options.provider);
    const providerName = provider.getProviderName();
    const modelName = provider.getModelName();

    const promptData = AiPromptService.buildDocumentIntelligencePrompt({
      documentType: doc.document_type,
      originalFilename: version.original_filename,
      extractedFields: extraction.extracted_fields,
      normalizedText: extraction.normalized_text,
    });

    let rawOutput;
    let durationMs;
    try {
      rawOutput = await provider.analyze(promptData);
      durationMs = Date.now() - startTime;
    } catch (err) {
      durationMs = Date.now() - startTime;
      await auditService.log({
        actorUserId,
        action: AUDIT_ACTIONS.AI_ANALYSIS_FAILED,
        resourceType: 'document_analysis',
        resourceId: documentId,
        ipAddress: reqMeta.ip,
        userAgent: reqMeta.userAgent,
        metadata: {
          organizationId,
          documentId,
          versionId: version.id,
          error: err.message,
          durationMs,
        },
      });
      throw AppError.internal(`AI Analysis Provider failed: ${err.message}`, 'AI_ANALYSIS_FAILED');
    }

    // 3. Strict Schema Validation & Auto-Repair
    const validated = AiSchemaValidator.validateAndRepair(rawOutput);
    const resultData = validated.data;
    const analysisId = uuidv4();

    return db.transaction(async (conn) => {
      // 4. Persist analysis entity
      const analysisRecord = await analysisRepository.createAnalysis(
        {
          id: analysisId,
          documentId,
          versionId: version.id,
          organizationId,
          status: 'COMPLETED',
          provider: providerName,
          model: modelName,
          promptVersion: promptData.promptVersion,
          documentType: resultData.documentType || doc.document_type,
          confidence: resultData.confidence || 0.95,
          summary: resultData.summary,
          structuredResult: resultData,
          processingDurationMs: durationMs,
          errorMessage: validated.valid ? null : 'Repaired from non-standard model output',
        },
        conn
      );

      // 5. Persist findings
      if (Array.isArray(resultData.findings)) {
        for (const finding of resultData.findings) {
          await analysisRepository.createFinding(
            {
              id: uuidv4(),
              analysisId,
              documentId,
              versionId: version.id,
              organizationId,
              category: finding.category,
              severity: finding.severity,
              title: finding.title,
              description: finding.description,
              evidence: finding.evidence,
              confidence: finding.confidence,
              location: finding.location,
            },
            conn
          );
        }
      }

      // 6. Persist risk indicators
      if (Array.isArray(resultData.riskIndicators)) {
        for (const indicator of resultData.riskIndicators) {
          await analysisRepository.createRiskIndicator(
            {
              id: uuidv4(),
              analysisId,
              documentId,
              versionId: version.id,
              organizationId,
              indicator: indicator.indicator,
              category: indicator.category,
              severity: indicator.severity,
              confidence: indicator.confidence,
              evidence: indicator.evidence,
            },
            conn
          );
        }
      }

      // 7. Audit log completion
      await auditService.log(
        {
          actorUserId,
          action: AUDIT_ACTIONS.AI_ANALYSIS_COMPLETED,
          resourceType: 'document_analysis',
          resourceId: analysisId,
          ipAddress: reqMeta.ip,
          userAgent: reqMeta.userAgent,
          metadata: {
            organizationId,
            documentId,
            versionId: version.id,
            analysisId,
            findingsCount: resultData.findings?.length || 0,
            confidence: resultData.confidence,
            durationMs,
          },
        },
        conn
      );

      return analysisRecord;
    });
  }

  async getLatestAnalysis(documentId, organizationId, versionId = null, actorUserId = null, reqMeta = {}) {
    const doc = await documentRepository.findById(documentId, organizationId);
    if (!doc) {
      throw AppError.notFound('Document not found in organization', 'DOCUMENT_NOT_FOUND');
    }

    const analysis = await analysisRepository.findLatestByDocument(documentId, organizationId, versionId);
    if (!analysis) {
      throw AppError.notFound('No AI analysis results found for this document', 'ANALYSIS_NOT_FOUND');
    }

    const findings = await analysisRepository.listFindingsByAnalysis(analysis.id, organizationId);
    const riskIndicators = await analysisRepository.listRiskIndicatorsByAnalysis(analysis.id, organizationId);

    if (actorUserId) {
      await auditService.log({
        actorUserId,
        action: AUDIT_ACTIONS.ANALYSIS_VIEWED,
        resourceType: 'document_analysis',
        resourceId: analysis.id,
        ipAddress: reqMeta.ip,
        userAgent: reqMeta.userAgent,
        metadata: { organizationId, documentId, analysisId: analysis.id },
      });
    }

    return {
      ...analysis,
      findings,
      risk_indicators: riskIndicators,
    };
  }

  async listFindings(documentId, organizationId, versionId = null) {
    await documentRepository.findById(documentId, organizationId);
    return analysisRepository.listFindingsByDocument(documentId, organizationId, versionId);
  }

  async listRiskIndicators(documentId, organizationId, versionId = null) {
    await documentRepository.findById(documentId, organizationId);
    return analysisRepository.listRiskIndicatorsByDocument(documentId, organizationId, versionId);
  }
}

export const aiAnalysisService = new AiAnalysisService();
