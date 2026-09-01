// src/services/parsers/permitParser.js
import { TextNormalizer } from '../extractors/normalizer.js';

export class PermitParser {
  /**
   * Parse structured Permit / Inner Line Permit (eILP) / Border Authorization / Work Clearance fields
   */
  static parse(text) {
    const fields = {
      permitNumber: { value: null, confidence: 0 },
      permitType: { value: null, confidence: 0 },
      holderName: { value: null, confidence: 0 },
      authorizedPort: { value: null, confidence: 0 },
      stayDuration: { value: null, confidence: 0 },
      validFrom: { value: null, confidence: 0 },
      validUntil: { value: null, confidence: 0 },
      dateOfBirth: { value: null, confidence: 0 },
      placeOfVisit: { value: null, confidence: 0 },
      issuingAuthority: { value: null, confidence: 0 },
      employerOrSponsor: { value: null, confidence: 0 },
      status: { value: null, confidence: 0 },
    };

    if (!text) return fields;

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      // Permit Number (e.g. eILP No 0220353191611566, PERMIT-2026-9821, WP-882194)
      if (!fields.permitNumber.value) {
        const match = line.match(/(?:eILP\s*no|ILP\s*no|permit\s*(?:no|number|#)?|authorization\s*(?:no|#)?|pass\s*no|work\s*permit\s*no)[:\s]+([A-Z0-9\-_/]{5,25})/i) ||
                      line.match(/\b(WP-[0-9]{5,10}|PERMIT-[0-9A-Z\-]{4,12}|[0-9]{12,20})\b/i);
        if (match) {
          fields.permitNumber = { value: match[1].toUpperCase(), confidence: 0.94 };
        }
      }

      // Permit Type (e.g. SINGLE, MULTIPLE, TEMPORARY_SINGLE_INNER_LINE_PERMIT, WORK_AUTHORIZATION, BORDER_TRANSIT)
      if (!fields.permitType.value) {
        const match = line.match(/(?:permit\s*type|type\s*of\s*(?:permit|visit)|category|class)[:\s]+([A-Za-z0-9\/\-\s]{3,35})/i) ||
                      line.match(/\b(SINGLE|MULTIPLE|TEMPORARY|INNER\s*LINE\s*PERMIT|WORK\s*PERMIT|BORDER\s*TRANSIT|RESIDENCE\s*PERMIT|SPECIAL\s*ENTRY\s*AUTHORIZATION|BUSINESS|TOURIST)\b/i);
        if (match) {
          fields.permitType = { value: match[1].trim().toUpperCase(), confidence: 0.90 };
        }
      }

      // Holder Name
      if (!fields.holderName.value) {
        const match = line.match(/^(?:name|holder|full\s*name|authorized\s*individual)[:\s]+([A-Za-z\s\.\-]{3,40})$/i) ||
                      line.match(/\bName\s*[:\s]+([A-Za-z\s\.\-]{3,40})\b/i);
        if (match && !/permit|authority|department|ministry|republic|immigration|government|arunachal|caution/i.test(match[1])) {
          fields.holderName = { value: match[1].trim(), confidence: 0.90 };
        }
      }

      // Date of Birth
      if (!fields.dateOfBirth.value) {
        const match = line.match(/(?:date\s*of\s*birth|dob|birth\s*date)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.dateOfBirth = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.91 };
        }
      }

      // Authorized Port / Zone / Check Gate
      if (!fields.authorizedPort.value) {
        const match = line.match(/(?:check\s*gate|port\s*of\s*entry|authorized\s*zone|checkpoint|port|zone)[:\s]+([A-Za-z0-9\s,\.\-]{3,50})/i);
        if (match) {
          fields.authorizedPort = { value: match[1].trim().toUpperCase(), confidence: 0.89 };
        }
      }

      // Place of Visit
      if (!fields.placeOfVisit.value) {
        const match = line.match(/(?:place\s*of\s*visit|destination|visit\s*location)[:\s]+([A-Za-z0-9\s,\.\-]{3,40})/i);
        if (match) {
          fields.placeOfVisit = { value: match[1].trim().toUpperCase(), confidence: 0.90 };
        }
      }

      // Valid From / Date of Visit / Date of Issue
      if (!fields.validFrom.value) {
        const match = line.match(/(?:date\s*of\s*visit|date\s*of\s*issue|issue\s*date|valid\s*from|issued)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.validFrom = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.89 };
        }
      }

      // Valid Until / Expiry / Date of Return
      if (!fields.validUntil.value) {
        const match = line.match(/(?:date\s*of\s*return|return\s*date|valid\s*until|expiry\s*date|expires|valid\s*upto|until)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.validUntil = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.89 };
        }
      }

      // Issuing Authority
      if (!fields.issuingAuthority.value) {
        const match = line.match(/(?:issuing\s*authority|issued\s*by|authority|place\s*of\s*issue)[:\s]+([A-Za-z0-9\s\.\-]{3,40})/i) ||
                      line.match(/(DC\s*Lower\s*Subansiri|Government\s*of\s*Arunachal\s*Pradesh|Department\s*of\s*Immigration|Border\s*Security\s*Agency|Ministry\s*of\s*Interior)/i);
        if (match) {
          fields.issuingAuthority = { value: match[1].trim(), confidence: 0.91 };
        }
      }
    }

    return fields;
  }
}

