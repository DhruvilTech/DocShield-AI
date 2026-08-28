// src/services/parsers/visaParser.js
import { TextNormalizer } from '../extractors/normalizer.js';

export class VisaParser {
  /**
   * Parse structured visa fields from text or OCR stream
   */
  static parse(text) {
    const fields = {
      visaNumber: { value: null, confidence: 0 },
      visaType: { value: null, confidence: 0 },
      entryValidation: { value: null, confidence: 0 },
      stayDuration: { value: null, confidence: 0 },
      validFrom: { value: null, confidence: 0 },
      validUntil: { value: null, confidence: 0 },
      holderName: { value: null, confidence: 0 },
      passportNumber: { value: null, confidence: 0 },
    };

    if (!text) return fields;

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      // Visa Number (e.g. V12345678, E-VISA-9876543)
      if (!fields.visaNumber.value) {
        const match = line.match(/(?:visa\s*(?:no|number|#)?[:\s]+)([A-Z0-9\-]{6,16})/i) ||
                      line.match(/(?:control\s*number[:\s]+)([A-Z0-9\-]{6,16})/i) ||
                      line.match(/\b(V[0-9]{7,9})\b/i);
        if (match) {
          fields.visaNumber = { value: match[1].toUpperCase(), confidence: 0.92 };
        }
      }

      // Visa Type (e.g. B1/B2, C-TOURIST, SCHENGEN, D-NATIONAL, WORK PERMIT)
      if (!fields.visaType.value) {
        const match = line.match(/(?:visa\s*type|type\s*of\s*visa|category|class)[:\s]+([A-Za-z0-9\/\-\s]{2,20})/i) ||
                      line.match(/\b(B1\/B2|TOURIST|BUSINESS|STUDENT|SCHENGEN|WORK\s*PERMIT|DIPLOMATIC)\b/i);
        if (match) {
          fields.visaType = { value: match[1].trim().toUpperCase(), confidence: 0.90 };
        }
      }

      // Entry Validation / Entries Allowed (Single, Multiple, Double, 01, 02, MULT)
      if (!fields.entryValidation.value) {
        const match = line.match(/(?:entries|number\s*of\s*entries|entry\s*validation)[:\s]+([A-Za-z0-9]+)/i) ||
                      line.match(/\b(MULTIPLE|SINGLE|DOUBLE|MULT|01|02|M)\b/i);
        if (match) {
          const raw = match[1].toUpperCase();
          const standardized = raw.includes('MULT') || raw === 'M' ? 'MULTIPLE' :
                               raw.includes('SING') || raw === '01' || raw === '1' ? 'SINGLE' :
                               raw.includes('DOUB') || raw === '02' || raw === '2' ? 'DOUBLE' : raw;
          fields.entryValidation = { value: standardized, confidence: 0.91 };
        }
      }

      // Stay Duration (e.g. 90 Days, 30 Days, 180 Days)
      if (!fields.stayDuration.value) {
        const match = line.match(/(?:duration\s*of\s*stay|stay\s*duration|stay)[:\s]+([0-9]+\s*(?:days?|months?|years?))/i) ||
                      line.match(/\b([0-9]{1,3}\s*DAYS)\b/i);
        if (match) {
          fields.stayDuration = { value: match[1].trim(), confidence: 0.90 };
        }
      }

      // Valid From / Issue Date
      if (!fields.validFrom.value) {
        const match = line.match(/(?:valid\s*from|issue\s*date|from)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.validFrom = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.89 };
        }
      }

      // Valid Until / Expiration Date
      if (!fields.validUntil.value) {
        const match = line.match(/(?:valid\s*until|expiry\s*date|expiration|until)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.validUntil = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.89 };
        }
      }

      // Holder Name
      if (!fields.holderName.value) {
        const match = line.match(/(?:bearer|holder|name|full\s*name)[:\s]+([A-Za-z\s\.\-]{3,40})/i);
        if (match && !/visa|passport|embassy|consulate|department/i.test(match[1])) {
          fields.holderName = { value: match[1].trim(), confidence: 0.87 };
        }
      }

      // Passport Number reference
      if (!fields.passportNumber.value) {
        const match = line.match(/(?:passport\s*(?:no|number)?|pp\s*no)[:\s]+([A-Z0-9]{7,10})/i);
        if (match) {
          fields.passportNumber = { value: match[1].toUpperCase(), confidence: 0.90 };
        }
      }
    }

    return fields;
  }
}
