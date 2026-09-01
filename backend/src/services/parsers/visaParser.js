// src/services/parsers/visaParser.js
import { TextNormalizer } from '../extractors/normalizer.js';

export class VisaParser {
  /**
   * Compute standard ICAO Doc 9303 7-3-1 check digit
   */
  static computeIcaoCheckDigit(str) {
    if (!str) return 0;
    const weights = [7, 3, 1];
    let sum = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charAt(i).toUpperCase();
      let val = 0;
      if (char >= '0' && char <= '9') {
        val = parseInt(char, 10);
      } else if (char >= 'A' && char <= 'Z') {
        val = char.charCodeAt(0) - 55;
      } else if (char === '<') {
        val = 0;
      }
      sum += val * weights[i % 3];
    }
    return sum % 10;
  }

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
      dateOfBirth: { value: null, confidence: 0 },
      dateOfExpiry: { value: null, confidence: 0 },
      holderName: { value: null, confidence: 0 },
      fullName: { value: null, confidence: 0 },
      surname: { value: null, confidence: 0 },
      givenNames: { value: null, confidence: 0 },
      nationality: { value: null, confidence: 0 },
      issuingCountry: { value: null, confidence: 0 },
      gender: { value: null, confidence: 0 },
      passportNumber: { value: null, confidence: 0 },
      visaFormat: { value: 'MRV_A', confidence: 0 },
      mrzLines: { value: [], confidence: 0 },
      mrzValidation: {
        value: {
          isValid: false,
          format: 'UNKNOWN',
          docNumberCheck: null,
          dobCheck: null,
          expiryCheck: null,
          errors: [],
        },
        confidence: 0,
      },
    };

    if (!text) return fields;

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    // 1. Check for Visa MRZ (ICAO Doc 9303 Part 7: MRV-A 2x44 or MRV-B 2x36 starting with V)
    const mrzCandidates = lines
      .map((l) => l.replace(/\s/g, '').replace(/[([{\]_«]/g, '<').toUpperCase())
      .filter((l) => /^V[<A-Z0-9]{30,48}/.test(l) || /^[A-Z0-9<]{34,48}$/.test(l));

    if (mrzCandidates.length >= 2) {
      let line1 = mrzCandidates[0];
      let line2 = mrzCandidates[1];

      // Swap lines if line2 starts with V and line1 does not
      if (line2.startsWith('V') && !line1.startsWith('V')) {
        const tmp = line1;
        line1 = line2;
        line2 = tmp;
      }

      if (line1.startsWith('V')) {
        const maxLen = Math.max(line1.length, line2.length);
        const targetLen = maxLen > 36 ? 44 : 36;
        const format = targetLen === 44 ? 'MRV_A' : 'MRV_B';

        line1 = line1.padEnd(targetLen, '<').substring(0, targetLen);
        line2 = line2.padEnd(targetLen, '<').substring(0, targetLen);

        fields.mrzLines = { value: [line1, line2], confidence: 0.98 };
        fields.visaFormat = { value: format, confidence: 0.98 };

        // Parse Line 1: V<INDDOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
        const country = line1.substring(2, 5).replace(/</g, '').replace(/^1ND$/, 'IND');
        const nameRaw = line1.substring(5);
        const nameParts = nameRaw.split('<<');
        const surname = nameParts[0] ? nameParts[0].replace(/</g, ' ').trim() : '';
        const givenNames = nameParts[1] ? nameParts[1].replace(/</g, ' ').trim() : '';
        const fullName = (givenNames && surname) ? `${givenNames} ${surname}` : (surname || givenNames);

        if (country) fields.issuingCountry = { value: country, confidence: 0.96 };
        if (surname) fields.surname = { value: surname, confidence: 0.96 };
        if (givenNames) fields.givenNames = { value: givenNames, confidence: 0.96 };
        if (fullName) {
          fields.fullName = { value: fullName, confidence: 0.96 };
          fields.holderName = { value: fullName, confidence: 0.96 };
        }

        // Parse Line 2: 12345678<8USA8501019M30010191234567890123456
        if (line2.length >= 28) {
          const rawDocNum = line2.substring(0, 9);
          const docNum = rawDocNum.replace(/</g, '');
          const docNumCheckDigit = line2.charAt(9);
          const nationality = line2.substring(10, 13).replace(/</g, '').replace(/^1ND$/, 'IND');
          const rawDob = line2.substring(13, 19);
          const dobCheckDigit = line2.charAt(19);
          const gender = line2.charAt(20);
          const rawExpiry = line2.substring(21, 27);
          const expiryCheckDigit = line2.charAt(27);

          if (docNum) fields.visaNumber = { value: docNum, confidence: 0.98 };
          if (nationality) fields.nationality = { value: nationality === 'IND' ? 'INDIAN' : nationality, confidence: 0.96 };
          if (rawDob && /^\d{6}$/.test(rawDob)) fields.dateOfBirth = { value: TextNormalizer.standardizeDate(rawDob), confidence: 0.96 };
          if (['M', 'F', 'X'].includes(gender)) fields.gender = { value: gender, confidence: 0.98 };
          if (rawExpiry && /^\d{6}$/.test(rawExpiry)) {
            const expDate = TextNormalizer.standardizeDate(rawExpiry);
            fields.dateOfExpiry = { value: expDate, confidence: 0.96 };
            fields.validUntil = { value: expDate, confidence: 0.96 };
          }

          if (line2.length > 28) {
            const optData = line2.substring(28).replace(/</g, '');
            if (/^[A-Z0-9]{7,10}$/.test(optData)) {
              fields.passportNumber = { value: optData, confidence: 0.90 };
            }
          }

          // ICAO 7-3-1 Checksum Validation for Visa MRZ
          const calcDocCheck = String(VisaParser.computeIcaoCheckDigit(rawDocNum));
          const calcDobCheck = String(VisaParser.computeIcaoCheckDigit(rawDob));
          const calcExpiryCheck = String(VisaParser.computeIcaoCheckDigit(rawExpiry));

          const isDocCheckValid = (docNumCheckDigit === '<' && calcDocCheck === '0') || docNumCheckDigit === calcDocCheck;
          const isDobCheckValid = dobCheckDigit === calcDobCheck;
          const isExpiryCheckValid = expiryCheckDigit === calcExpiryCheck;

          const mrzErrors = [];
          if (!isDocCheckValid) mrzErrors.push(`Visa number check digit mismatch (expected ${calcDocCheck}, found ${docNumCheckDigit})`);
          if (!isDobCheckValid) mrzErrors.push(`DOB check digit mismatch (expected ${calcDobCheck}, found ${dobCheckDigit})`);
          if (!isExpiryCheckValid) mrzErrors.push(`Expiry date check digit mismatch (expected ${calcExpiryCheck}, found ${expiryCheckDigit})`);

          const isOverallMrzValid = isDocCheckValid && isDobCheckValid && isExpiryCheckValid;

          fields.mrzValidation = {
            value: {
              isValid: isOverallMrzValid,
              format,
              docNumberCheck: { expected: calcDocCheck, actual: docNumCheckDigit, valid: isDocCheckValid },
              dobCheck: { expected: calcDobCheck, actual: dobCheckDigit, valid: isDobCheckValid },
              expiryCheck: { expected: calcExpiryCheck, actual: expiryCheckDigit, valid: isExpiryCheckValid },
              errors: mrzErrors,
            },
            confidence: isOverallMrzValid ? 0.98 : 0.65,
          };
        }
      }
    }

    // 2. Visual Inspection Zone Extraction (Regex & Proximity)
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
          const expDate = TextNormalizer.standardizeDate(match[1]);
          fields.validUntil = { value: expDate, confidence: 0.89 };
          if (!fields.dateOfExpiry.value) {
            fields.dateOfExpiry = { value: expDate, confidence: 0.89 };
          }
        }
      }

      // Date of Birth
      if (!fields.dateOfBirth.value) {
        const match = line.match(/(?:date\s*of\s*birth|dob|birth\s*date)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.dateOfBirth = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.89 };
        }
      }

      // Holder Name
      if (!fields.holderName.value) {
        const match = line.match(/(?:name\s*of\s*bearer|bearer|holder|name|full\s*name)[:\s]+([A-Za-z\s\.\-]{3,40})/i);
        if (match && !/visa|passport|embassy|consulate|department/i.test(match[1])) {
          const cleanName = match[1].trim();
          fields.holderName = { value: cleanName, confidence: 0.87 };
          if (!fields.fullName.value) fields.fullName = { value: cleanName, confidence: 0.87 };
        }
      }

      // Nationality
      if (!fields.nationality.value) {
        const match = line.match(/(?:nationality|citizenship)[:\s]+([A-Za-z\s]{3,30})/i);
        if (match && !/visa|type|passport/i.test(match[1])) {
          fields.nationality = { value: match[1].trim().toUpperCase(), confidence: 0.88 };
        }
      }

      // Gender / Sex
      if (!fields.gender.value) {
        const match = line.match(/(?:sex|gender|sexe)[:\s]+([MFX]|MALE|FEMALE)/i);
        if (match) {
          const g = match[1].toUpperCase();
          fields.gender = { value: g.startsWith('M') ? 'M' : g.startsWith('F') ? 'F' : g, confidence: 0.90 };
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

    if (!fields.gender.value) fields.gender = { value: null, confidence: 0 };

    return fields;
  }
}

