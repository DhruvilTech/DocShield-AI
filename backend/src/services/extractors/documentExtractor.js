// src/services/extractors/documentExtractor.js
import { PdfExtractor } from './pdfExtractor.js';
import { ImageOcrExtractor } from './imageOcrExtractor.js';
import { TextNormalizer } from './normalizer.js';
import { PassportParser } from '../parsers/passportParser.js';
import { VisaParser } from '../parsers/visaParser.js';
import { NationalIdParser } from '../parsers/nationalIdParser.js';
import { PermitParser } from '../parsers/permitParser.js';
import { DOCUMENT_TYPES } from '../../config/constants.js';

export class DocumentExtractor {
  /**
   * Main entry point for extracting and structuring document content
   */
  static async extract(fileBuffer, mimeType, originalFilename = '', documentType = 'OTHER') {
    let extractionResult = {
      rawText: '',
      pageCount: 1,
      extractor: 'GenericExtractor',
      metadata: {},
    };

    // 1. Dispatch based on MIME type
    if (mimeType === 'application/pdf') {
      extractionResult = await PdfExtractor.extract(fileBuffer);
    } else if (mimeType.startsWith('image/')) {
      extractionResult = await ImageOcrExtractor.extract(fileBuffer, mimeType, originalFilename);
    } else {
      // DOCX, TXT or generic binary
      const text = fileBuffer.toString('utf-8');
      extractionResult = {
        rawText: text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').trim() || `Document ${originalFilename}`,
        pageCount: 1,
        extractor: 'TextStreamExtractor',
        metadata: { mimeType, originalFilename },
      };
    }

    // 2. Normalize content
    const normalizedText = TextNormalizer.normalize(extractionResult.rawText);

    // 3. Extract structured domain fields
    let extractedFields = {};
    let confidenceSum = 0;
    let fieldCount = 0;

    if (documentType === DOCUMENT_TYPES.PASSPORT || /passport/i.test(originalFilename)) {
      extractedFields = PassportParser.parse(normalizedText || extractionResult.rawText);
    } else if (documentType === DOCUMENT_TYPES.VISA || /visa/i.test(originalFilename)) {
      extractedFields = VisaParser.parse(normalizedText || extractionResult.rawText);
    } else if (documentType === DOCUMENT_TYPES.PERMIT || /permit|transit|clearance/i.test(originalFilename)) {
      extractedFields = PermitParser.parse(normalizedText || extractionResult.rawText);
    } else if (
      [DOCUMENT_TYPES.NATIONAL_ID, DOCUMENT_TYPES.DRIVING_LICENSE].includes(documentType) ||
      /license|id_card|national/i.test(originalFilename)
    ) {
      extractedFields = NationalIdParser.parse(normalizedText || extractionResult.rawText);
    } else {
      // General attempt: try passport, visa, permit, and ID parsers to see if any match
      const passportAttempt = PassportParser.parse(normalizedText);
      const visaAttempt = VisaParser.parse(normalizedText);
      const permitAttempt = PermitParser.parse(normalizedText);

      if (passportAttempt.passportNumber.value || passportAttempt.mrzLines.value.length > 0) {
        extractedFields = passportAttempt;
      } else if (visaAttempt.visaNumber.value || visaAttempt.visaType.value) {
        extractedFields = visaAttempt;
      } else if (permitAttempt.permitNumber.value || permitAttempt.permitType.value) {
        extractedFields = permitAttempt;
      } else {
        extractedFields = passportAttempt;
      }
    }

    // Calculate aggregate confidence score
    for (const key of Object.keys(extractedFields)) {
      if (extractedFields[key] && extractedFields[key].confidence > 0) {
        confidenceSum += extractedFields[key].confidence;
        fieldCount++;
      }
    }

    const aggregateConfidence = fieldCount > 0
      ? Number((confidenceSum / fieldCount).toFixed(2))
      : 0.90;

    return {
      rawText: extractionResult.rawText,
      normalizedText,
      extractedFields,
      confidenceScore: aggregateConfidence,
      pageCount: extractionResult.pageCount,
      extractorName: extractionResult.extractor,
      metadata: extractionResult.metadata,
    };
  }
}
