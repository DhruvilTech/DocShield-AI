// src/services/parsers/nationalIdParser.js
import { TextNormalizer } from '../extractors/normalizer.js';

export class NationalIdParser {
  /**
   * Parse structured National ID / Driving License fields
   */
  static parse(text) {
    const fields = {
      idNumber: { value: null, confidence: 0 },
      fullName: { value: null, confidence: 0 },
      dateOfBirth: { value: null, confidence: 0 },
      dateOfExpiry: { value: null, confidence: 0 },
      dateOfIssue: { value: null, confidence: 0 },
      address: { value: null, confidence: 0 },
      licenseClass: { value: null, confidence: 0 },
      nationality: { value: null, confidence: 0 },
    };

    if (!text) return fields;

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      // ID / License Number
      if (!fields.idNumber.value) {
        const match = line.match(/(?:id\s*(?:no|number|#)|license\s*(?:no|number|#)|dl\s*no)[:\s]+([A-Z0-9\-]{5,18})/i) ||
                      line.match(/\b([A-Z]{1,3}[0-9]{6,12})\b/);
        if (match) {
          fields.idNumber = { value: match[1].toUpperCase(), confidence: 0.90 };
        }
      }

      // Full Name
      if (!fields.fullName.value) {
        const match = line.match(/(?:name|full\s*name|holder)[:\s]+([A-Za-z\s\.\-]{3,40})/i);
        if (match && !/identity|license|republic|driver|department/i.test(match[1])) {
          fields.fullName = { value: match[1].trim(), confidence: 0.88 };
        }
      }

      // Date of Birth
      if (!fields.dateOfBirth.value) {
        const match = line.match(/(?:dob|date\s*of\s*birth|birth\s*date)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.dateOfBirth = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.90 };
        }
      }

      // Expiry Date
      if (!fields.dateOfExpiry.value) {
        const match = line.match(/(?:exp|expiry\s*date|valid\s*until|expires)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.dateOfExpiry = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.89 };
        }
      }

      // Issue Date
      if (!fields.dateOfIssue.value) {
        const match = line.match(/(?:iss|issue\s*date|issued)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.dateOfIssue = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.88 };
        }
      }

      // License Class
      if (!fields.licenseClass.value) {
        const match = line.match(/(?:class|license\s*class)[:\s]+([A-Z0-9]+)/i);
        if (match) {
          fields.licenseClass = { value: match[1].toUpperCase(), confidence: 0.92 };
        }
      }
    }

    return fields;
  }
}
