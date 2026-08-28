// src/services/ai/aiPrompt.service.js

export const PROMPT_VERSIONS = {
  DOCUMENT_INTELLIGENCE_V1: 'v1.0.0',
};

export class AiPromptService {
  /**
   * Build structured document security and fraud intelligence prompt
   */
  static buildDocumentIntelligencePrompt(documentData) {
    const {
      documentType,
      originalFilename,
      extractedFields,
      normalizedText,
    } = documentData;

    // Minimize data: exclude storage paths, user tokens, internal system IDs
    const sanitizedExtracted = {};
    if (extractedFields) {
      for (const [key, obj] of Object.entries(extractedFields)) {
        if (obj && obj.value !== null && obj.value !== undefined) {
          sanitizedExtracted[key] = obj.value;
        }
      }
    }

    const systemPrompt = `You are DocShield AI, an advanced document intelligence and fraud detection analysis engine.
Your task is to analyze extracted document text and structured fields for:
1. Document Consistency (logical coherence of dates, names, issuers)
2. Missing or Anomalous Fields (required mandatory security fields)
3. Identity Document Discrepancies (MRZ vs Visual Zone alignment, date math)
4. Validation Concerns & Potential Tampering Indicators
5. Risk Indicators (actionable flags for fraud screening)

CRITICAL: Return ONLY valid, parseable JSON matching the exact schema below. Do not wrap in markdown or prose.

Schema:
{
  "documentType": "${documentType || 'PASSPORT'}",
  "confidence": 0.95,
  "summary": "Concise summary of findings and document integrity.",
  "findings": [
    {
      "category": "IDENTITY | DOCUMENT | VALIDATION | FRAUD | SECURITY | DATA_CONSISTENCY",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW | INFO",
      "title": "Short descriptive title of finding",
      "description": "Detailed explanation of the issue or verification check",
      "evidence": "Extracted text or field showing the anomaly",
      "confidence": 0.95,
      "location": "Page 1 / MRZ / Visual Inspection Zone"
    }
  ],
  "recommendations": [
    "Actionable recommendation for screening officer"
  ],
  "riskIndicators": [
    {
      "indicator": "EXPIRED_DOCUMENT | MRZ_MISMATCH | DATE_INCONSISTENCY | VALID_CREDENTIAL",
      "category": "IDENTITY | FRAUD | COMPLIANCE",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW | INFO",
      "confidence": 0.95,
      "evidence": "Supporting details"
    }
  ]
}`;

    const userPrompt = `Document Filename: ${originalFilename}
Document Type: ${documentType}
Structured Extracted Fields:
${JSON.stringify(sanitizedExtracted, null, 2)}

Normalized Text Content:
${normalizedText ? normalizedText.substring(0, 4000) : 'No text extracted'}`;

    return {
      promptVersion: PROMPT_VERSIONS.DOCUMENT_INTELLIGENCE_V1,
      systemPrompt,
      userPrompt,
      sanitizedPayload: {
        documentType,
        originalFilename,
        extractedFields: sanitizedExtracted,
      },
    };
  }
}
