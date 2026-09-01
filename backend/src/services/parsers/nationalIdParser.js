// src/services/parsers/nationalIdParser.js
import { TextNormalizer } from '../extractors/normalizer.js';

export class NationalIdParser {
  /**
   * Parse structured National ID / Driving License fields
   */
  static parse(text) {
    const fields = {
      idNumber: { value: null, confidence: 0 },
      licenseNumber: { value: null, confidence: 0 },
      fullName: { value: null, confidence: 0 },
      name: { value: null, confidence: 0 },
      dateOfBirth: { value: null, confidence: 0 },
      dateOfExpiry: { value: null, confidence: 0 },
      dateOfIssue: { value: null, confidence: 0 },
      address: { value: null, confidence: 0 },
      licenseClass: { value: null, confidence: 0 },
      vehicleClass: { value: null, confidence: 0 },
      nationality: { value: null, confidence: 0 },
    };

    if (!text) return fields;

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    const isCleanName = (val) => {
      if (!val) return false;
      const clean = val.trim().toUpperCase();
      const noise = [
        'SIGNATURE', 'HOLDER', "HOLDER'S SIGNATURE", 'SIGN', 'LICENCE', 'LICENSE',
        'DRIVING', 'UNION', 'INDIAN', 'GUJARAT', 'MAHARASHTRA', 'GOVERNMENT',
        'STATE', 'AUTHORITY', 'TRANSPORT', 'MINISTRY', 'MORTH', 'SARATHI',
        'SON', 'DAUGHTER', 'WIFE', 'S/O', 'D/O', 'W/O', 'DATE', 'ISSUE',
        'EXPIRY', 'VALIDITY', 'CLASS', 'ADDRESS', 'BLOOD', 'GROUP', 'DONOR'
      ];
      if (noise.some((n) => clean.includes(n))) return false;
      if (clean.length < 3) return false;
      return true;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // ID / License Number (e.g. GJ06 20230002129 or MH0120200034761)
      if (!fields.idNumber.value) {
        const match =
          line.match(/\b([A-Z]{2}[\s\-]?[0-9]{2}[\s\-]?(?:19|20)[0-9]{2}[\s\-]?[0-9]{7})\b/i) ||
          line.match(/(?:id\s*(?:no|number|#)|license\s*(?:no|number|#)|dl\s*no)[:\s]+([A-Z0-9\s\-]{5,20})/i) ||
          line.match(/\b([A-Z]{2}[0-9]{13})\b/i) ||
          line.match(/\b([0-9]{4}\s*[0-9]{4}\s*[0-9]{4})\b/);
        if (match) {
          const cleanNum = match[1].replace(/[\s\-]/g, '').toUpperCase();
          fields.idNumber = { value: cleanNum, confidence: 0.95 };
          fields.licenseNumber = { value: cleanNum, confidence: 0.95 };
        }
      }

      // Full Name (e.g. Name : PARTH PATHAK)
      if (!fields.fullName.value) {
        const match =
          line.match(/(?:Name|Full\s*Name|Naam)\s*[:\s\-]+([A-Za-z\s.\-]{3,40})/i) ||
          line.match(/^Name\s*:\s*([A-Za-z\s.\-]{3,40})/i);
        if (match && isCleanName(match[1])) {
          const clean = match[1].trim().toUpperCase();
          fields.fullName = { value: clean, confidence: 0.95 };
          fields.name = { value: clean, confidence: 0.95 };
        }
      }

      // Date of Birth
      if (!fields.dateOfBirth.value) {
        const match = line.match(/(?:Date\s*Of\s*Birth|DOB|Birth\s*Date|Janm\s*Tithi)\s*[:\s\-]*([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.dateOfBirth = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.94 };
        }
      }

      // Issue Date (e.g. Issue Date 04-02-2023 or Date Of First Issue 04-02-2023)
      if (!fields.dateOfIssue.value) {
        const match = line.match(/(?:Issue\s*Date|Date\s*Of\s*First\s*Issue|Date\s*of\s*Issue|Issued\s*On|DOI|Issue)\s*[:\s\-]*([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.dateOfIssue = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.92 };
        }
      }

      // Expiry Date / Validity (e.g. Validity ( NT ) 25-08-2046)
      if (!fields.dateOfExpiry.value) {
        const match = line.match(/(?:Validity\s*(?:\(\s*[A-Z]+\s*\))?|Valid\s*(?:Till|Upto|Until)|Expiry\s*Date|Date\s*of\s*Expiry|Expires|EXP)\s*[:\s\-]*([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.dateOfExpiry = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.92 };
        }
      }

      // Vehicle Class (e.g. LMV, MCWG, NT, TR)
      if (!fields.licenseClass.value) {
        const match = line.match(/\b(LMV|MCWG|MCWOG|HPMV|HTV|HGV|MGV|LPV|LDRXCV|ADAPT|TR|NT)\b/i);
        if (match) {
          fields.licenseClass = { value: match[1].toUpperCase(), confidence: 0.90 };
          fields.vehicleClass = { value: match[1].toUpperCase(), confidence: 0.90 };
        }
      }
    }

    // Chronological Multi-Date Fallback
    if (!fields.dateOfIssue.value || !fields.dateOfExpiry.value || !fields.dateOfBirth.value) {
      const allDateMatches = text.match(/\b(\d{2}[/\-.]\d{2}[/\-.]\d{4})\b/g);
      if (allDateMatches && allDateMatches.length >= 2) {
        const parsed = Array.from(new Set(allDateMatches.map((d) => TextNormalizer.standardizeDate(d)))).sort();
        if (parsed.length >= 3) {
          if (!fields.dateOfBirth.value) fields.dateOfBirth = { value: parsed[0], confidence: 0.90 };
          if (!fields.dateOfIssue.value) fields.dateOfIssue = { value: parsed[1], confidence: 0.90 };
          if (!fields.dateOfExpiry.value) fields.dateOfExpiry = { value: parsed[2], confidence: 0.90 };
        } else if (parsed.length === 2) {
          if (!fields.dateOfBirth.value) fields.dateOfBirth = { value: parsed[0], confidence: 0.90 };
          if (!fields.dateOfExpiry.value) fields.dateOfExpiry = { value: parsed[1], confidence: 0.90 };
        }
      }
    }

    return fields;
  }
}
