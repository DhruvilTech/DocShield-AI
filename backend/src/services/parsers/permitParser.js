// src/services/parsers/permitParser.js
import { TextNormalizer } from '../extractors/normalizer.js';

export class PermitParser {
  /**
   * Parse structured Permit / Border Authorization / Work Clearance fields
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
      issuingAuthority: { value: null, confidence: 0 },
      employerOrSponsor: { value: null, confidence: 0 },
      status: { value: null, confidence: 0 },
    };

    if (!text) return fields;

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      // Permit Number (e.g. PERMIT-2026-9821, WP-882194)
      if (!fields.permitNumber.value) {
        const match = line.match(/(?:permit\s*(?:no|number|#)?|authorization\s*(?:no|#)?|work\s*permit\s*no)[:\s]+([A-Z0-9\-]{5,18})/i) ||
                      line.match(/\b(WP-[0-9]{5,10}|PERMIT-[0-9A-Z\-]{4,12})\b/i);
        if (match) {
          fields.permitNumber = { value: match[1].toUpperCase(), confidence: 0.92 };
        }
      }

      // Permit Type (e.g. WORK_AUTHORIZATION, BORDER_TRANSIT, SPECIAL_ENTRY, RESIDENCE)
      if (!fields.permitType.value) {
        const match = line.match(/(?:permit\s*type|type\s*of\s*permit|category|class)[:\s]+([A-Za-z0-9\/\-\s]{3,30})/i) ||
                      line.match(/\b(WORK\s*PERMIT|BORDER\s*TRANSIT|RESIDENCE\s*PERMIT|SPECIAL\s*ENTRY\s*AUTHORIZATION|TEMPORARY\s*WORKER)\b/i);
        if (match) {
          fields.permitType = { value: match[1].trim().toUpperCase(), confidence: 0.90 };
        }
      }

      // Holder Name
      if (!fields.holderName.value) {
        const match = line.match(/(?:name|holder|full\s*name|authorized\s*individual)[:\s]+([A-Za-z\s\.\-]{3,40})/i);
        if (match && !/permit|authority|department|ministry|republic|immigration/i.test(match[1])) {
          fields.holderName = { value: match[1].trim(), confidence: 0.88 };
        }
      }

      // Authorized Port / Zone
      if (!fields.authorizedPort.value) {
        const match = line.match(/(?:port\s*of\s*entry|authorized\s*zone|checkpoint|port|zone)[:\s]+([A-Za-z0-9\s\.\-]{3,30})/i);
        if (match) {
          fields.authorizedPort = { value: match[1].trim().toUpperCase(), confidence: 0.89 };
        }
      }

      // Stay Duration
      if (!fields.stayDuration.value) {
        const match = line.match(/(?:duration|stay\s*duration|authorized\s*stay)[:\s]+([0-9]+\s*(?:days?|months?|years?))/i) ||
                      line.match(/\b([0-9]{1,3}\s*DAYS|[0-9]{1,2}\s*MONTHS)\b/i);
        if (match) {
          fields.stayDuration = { value: match[1].trim(), confidence: 0.90 };
        }
      }

      // Valid From
      if (!fields.validFrom.value) {
        const match = line.match(/(?:valid\s*from|issue\s*date|issued)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.validFrom = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.89 };
        }
      }

      // Valid Until / Expiry
      if (!fields.validUntil.value) {
        const match = line.match(/(?:valid\s*until|expiry\s*date|expires|until)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.validUntil = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.89 };
        }
      }

      // Issuing Authority
      if (!fields.issuingAuthority.value) {
        const match = line.match(/(?:issuing\s*authority|issued\s*by|authority)[:\s]+([A-Za-z0-9\s\.\-]{3,40})/i) ||
                      line.match(/(Department\s*of\s*Immigration|Border\s*Security\s*Agency|Ministry\s*of\s*Interior|Homeland\s*Security)/i);
        if (match) {
          fields.issuingAuthority = { value: match[1].trim(), confidence: 0.91 };
        }
      }
    }

    return fields;
  }
}
