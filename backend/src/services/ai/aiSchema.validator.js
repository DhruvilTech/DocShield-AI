// src/services/ai/aiSchema.validator.js
import { z } from 'zod';

const findingCategoryEnum = z.enum([
  'IDENTITY',
  'DOCUMENT',
  'VALIDATION',
  'FRAUD',
  'SECURITY',
  'DATA_CONSISTENCY',
]);

const severityEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);

export const findingSchema = z.object({
  category: findingCategoryEnum.default('DOCUMENT'),
  severity: severityEnum.default('INFO'),
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  evidence: z.string().nullable().optional(),
  confidence: z.coerce.number().min(0).max(1).default(1.0),
  location: z.string().nullable().optional(),
});

export const riskIndicatorSchema = z.object({
  indicator: z.string().min(1).max(100),
  category: z.string().default('IDENTITY'),
  severity: severityEnum.default('INFO'),
  confidence: z.coerce.number().min(0).max(1).default(1.0),
  evidence: z.string().nullable().optional(),
});

export const aiAnalysisOutputSchema = z.object({
  documentType: z.string().default('OTHER'),
  confidence: z.coerce.number().min(0).max(1).default(0.95),
  summary: z.string().default('Document intelligence analysis completed successfully.'),
  findings: z.array(findingSchema).default([]),
  recommendations: z.array(z.string()).default([]),
  riskIndicators: z.array(riskIndicatorSchema).default([]),
});

export class AiSchemaValidator {
  /**
   * Validate and safely repair model output
   */
  static validateAndRepair(rawOutput) {
    let parsedJson = rawOutput;

    if (typeof rawOutput === 'string') {
      try {
        // Strip any accidental markdown formatting ```json ... ```
        const cleaned = rawOutput
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/, '')
          .replace(/\s*```$/, '')
          .trim();
        parsedJson = JSON.parse(cleaned);
      } catch (err) {
        // Return structured fallback
        return {
          valid: false,
          data: this.createSafeFallback('Failed to parse AI output into valid JSON', err.message),
          error: err.message,
        };
      }
    }

    const validation = aiAnalysisOutputSchema.safeParse(parsedJson);

    if (validation.success) {
      return {
        valid: true,
        data: validation.data,
      };
    }

    // Try auto-repairing normalized fields
    try {
      const repaired = {
        documentType: parsedJson?.documentType || 'OTHER',
        confidence: Number(parsedJson?.confidence) || 0.90,
        summary: parsedJson?.summary || 'Automated analysis repaired by schema guard.',
        findings: Array.isArray(parsedJson?.findings)
          ? parsedJson.findings.map((f) => ({
              category: this.normalizeCategory(f?.category),
              severity: this.normalizeSeverity(f?.severity),
              title: String(f?.title || 'Document Inspection Item').substring(0, 255),
              description: String(f?.description || 'Item analyzed during document verification.'),
              evidence: f?.evidence ? String(f.evidence) : null,
              confidence: Number(f?.confidence) || 0.90,
              location: f?.location ? String(f.location).substring(0, 255) : null,
            }))
          : [],
        recommendations: Array.isArray(parsedJson?.recommendations)
          ? parsedJson.recommendations.map(String)
          : [],
        riskIndicators: Array.isArray(parsedJson?.riskIndicators)
          ? parsedJson.riskIndicators.map((r) => ({
              indicator: String(r?.indicator || 'GENERAL_CHECK').substring(0, 100),
              category: String(r?.category || 'DOCUMENT'),
              severity: this.normalizeSeverity(r?.severity),
              confidence: Number(r?.confidence) || 0.90,
              evidence: r?.evidence ? String(r.evidence) : null,
            }))
          : [],
      };

      return {
        valid: true,
        data: repaired,
        repaired: true,
      };
    } catch (repairErr) {
      return {
        valid: false,
        data: this.createSafeFallback('Invalid schema structure from AI provider', repairErr.message),
        error: validation.error.format(),
      };
    }
  }

  static normalizeCategory(cat) {
    const valid = ['IDENTITY', 'DOCUMENT', 'VALIDATION', 'FRAUD', 'SECURITY', 'DATA_CONSISTENCY'];
    if (typeof cat === 'string' && valid.includes(cat.toUpperCase())) {
      return cat.toUpperCase();
    }
    return 'DOCUMENT';
  }

  static normalizeSeverity(sev) {
    const valid = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
    if (typeof sev === 'string' && valid.includes(sev.toUpperCase())) {
      return sev.toUpperCase();
    }
    return 'INFO';
  }

  static createSafeFallback(reason, details = '') {
    return {
      documentType: 'OTHER',
      confidence: 0.50,
      summary: `Automated Document Verification Fallback: ${reason}`,
      findings: [
        {
          category: 'VALIDATION',
          severity: 'INFO',
          title: 'Automated Processing Check',
          description: `Document processed with fallback validator: ${details || reason}`,
          evidence: null,
          confidence: 0.50,
          location: 'Document Enclave',
        },
      ],
      recommendations: ['Perform manual screening review by an authorized screening officer.'],
      riskIndicators: [
        {
          indicator: 'MANUAL_REVIEW_RECOMMENDED',
          category: 'COMPLIANCE',
          severity: 'INFO',
          confidence: 0.50,
          evidence: reason,
        },
      ],
    };
  }
}
