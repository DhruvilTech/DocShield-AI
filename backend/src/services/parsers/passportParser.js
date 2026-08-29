// src/services/parsers/passportParser.js
import { TextNormalizer } from '../extractors/normalizer.js';

export class PassportParser {
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
   * Parse structured passport fields from text or OCR stream
   */
  static parse(text) {
    const fields = {
      fullName: { value: null, confidence: 0 },
      passportNumber: { value: null, confidence: 0 },
      nationality: { value: null, confidence: 0 },
      dateOfBirth: { value: null, confidence: 0 },
      dateOfExpiry: { value: null, confidence: 0 },
      gender: { value: null, confidence: 0 },
      issuingCountry: { value: null, confidence: 0 },
      mrzLines: { value: [], confidence: 0 },
      mrzValidation: {
        value: {
          isValid: false,
          docNumberCheck: null,
          dobCheck: null,
          expiryCheck: null,
          compositeCheck: null,
          errors: [],
        },
        confidence: 0,
      },
    };

    if (!text) return fields;

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    // 1. Check for MRZ (Machine Readable Zone: Type 3 standard 2 lines of 44 chars starting with P<)
    const mrzCandidates = lines.filter((l) => /P[<A-Z0-9]{40,46}/.test(l.replace(/\s/g, '')) || /^[A-Z0-9<]{40,46}$/.test(l.replace(/\s/g, '')));
    if (mrzCandidates.length >= 2) {
      const line1 = mrzCandidates[0].replace(/\s/g, '');
      const line2 = mrzCandidates[1].replace(/\s/g, '');

      fields.mrzLines = { value: [line1, line2], confidence: 0.98 };

      // Line 1: P<ISSLASTNAME<<FIRSTNAME<MIDDLENAME<<<<<<<<<<<<<<<<<<
      if (line1.startsWith('P<') || line1.startsWith('P')) {
        const country = line1.substring(2, 5).replace(/</g, '');
        const namePart = line1.substring(5).split('<<');
        const surname = namePart[0] ? namePart[0].replace(/</g, ' ').trim() : '';
        const givenNames = namePart[1] ? namePart[1].replace(/</g, ' ').trim() : '';
        const fullName = `${givenNames} ${surname}`.trim();

        if (fullName) {
          fields.fullName = { value: fullName, confidence: 0.95 };
        }
        if (country) {
          fields.issuingCountry = { value: country, confidence: 0.95 };
          fields.nationality = { value: country, confidence: 0.95 };
        }
      }

      // Line 2: 1234567897USA7001014M2501014<<<<<<<<<<<<<<6
      if (line2.length >= 28) {
        const rawPassNum = line2.substring(0, 9);
        const passNum = rawPassNum.replace(/</g, '');
        const passNumCheckDigit = line2.charAt(9);
        const nationality = line2.substring(10, 13).replace(/</g, '');
        const dob = line2.substring(13, 19);
        const dobCheckDigit = line2.charAt(19);
        const gender = line2.charAt(20);
        const expiry = line2.substring(21, 27);
        const expiryCheckDigit = line2.charAt(27);

        if (passNum) fields.passportNumber = { value: passNum, confidence: 0.96 };
        if (nationality) fields.nationality = { value: nationality, confidence: 0.95 };
        if (dob) fields.dateOfBirth = { value: TextNormalizer.standardizeDate(dob), confidence: 0.94 };
        if (['M', 'F', 'X'].includes(gender)) fields.gender = { value: gender, confidence: 0.97 };
        if (expiry) fields.dateOfExpiry = { value: TextNormalizer.standardizeDate(expiry), confidence: 0.94 };

        // ICAO 9303 Checksum Validations
        const calcPassCheck = PassportParser.computeIcaoCheckDigit(rawPassNum);
        const calcDobCheck = PassportParser.computeIcaoCheckDigit(dob);
        const calcExpiryCheck = PassportParser.computeIcaoCheckDigit(expiry);

        const isPassCheckValid = !passNumCheckDigit || passNumCheckDigit === '<' || parseInt(passNumCheckDigit, 10) === calcPassCheck;
        const isDobCheckValid = !dobCheckDigit || dobCheckDigit === '<' || parseInt(dobCheckDigit, 10) === calcDobCheck;
        const isExpiryCheckValid = !expiryCheckDigit || expiryCheckDigit === '<' || parseInt(expiryCheckDigit, 10) === calcExpiryCheck;

        const mrzErrors = [];
        if (!isPassCheckValid) mrzErrors.push(`Document number check digit mismatch (expected ${calcPassCheck}, found ${passNumCheckDigit})`);
        if (!isDobCheckValid) mrzErrors.push(`Date of birth check digit mismatch (expected ${calcDobCheck}, found ${dobCheckDigit})`);
        if (!isExpiryCheckValid) mrzErrors.push(`Expiry date check digit mismatch (expected ${calcExpiryCheck}, found ${expiryCheckDigit})`);

        const isOverallMrzValid = isPassCheckValid && isDobCheckValid && isExpiryCheckValid;

        fields.mrzValidation = {
          value: {
            isValid: isOverallMrzValid,
            docNumberCheck: { expected: calcPassCheck, actual: passNumCheckDigit, valid: isPassCheckValid },
            dobCheck: { expected: calcDobCheck, actual: dobCheckDigit, valid: isDobCheckValid },
            expiryCheck: { expected: calcExpiryCheck, actual: expiryCheckDigit, valid: isExpiryCheckValid },
            errors: mrzErrors,
          },
          confidence: isOverallMrzValid ? 0.98 : 0.65,
        };
      }
    }

    // 2. Regular Expression & Keyword Extraction (Visual Inspection Zone Fallback)
    for (const line of lines) {
      // Passport Number
      if (!fields.passportNumber.value) {
        const match = line.match(/(?:passport\s*(?:no|number|#)?[:\s]+)([A-Z0-9]{7,10})/i) ||
                      line.match(/\b([A-Z]{1,2}[0-9]{7,8})\b/);
        if (match) {
          fields.passportNumber = { value: match[1].toUpperCase(), confidence: 0.90 };
        }
      }

      // Full Name
      if (!fields.fullName.value) {
        const match = line.match(/(?:name|full\s*name|surname|given\s*names?)[:\s]+([A-Za-z\s\.\-]{3,40})/i);
        if (match && !/passport|number|republic|identity|department/i.test(match[1])) {
          fields.fullName = { value: match[1].trim(), confidence: 0.88 };
        }
      }

      // Nationality
      if (!fields.nationality.value) {
        const match = line.match(/(?:nationality|citizenship)[:\s]+([A-Za-z\s]{3,30})/i);
        if (match) {
          fields.nationality = { value: match[1].trim(), confidence: 0.89 };
        }
      }

      // Date of Birth
      if (!fields.dateOfBirth.value) {
        const match = line.match(/(?:date\s*of\s*birth|dob|birth\s*date)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.dateOfBirth = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.90 };
        }
      }

      // Date of Expiry
      if (!fields.dateOfExpiry.value) {
        const match = line.match(/(?:date\s*of\s*expiry|expiration\s*date|valid\s*until|expiry\s*date)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.dateOfExpiry = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.90 };
        }
      }

      // Gender
      if (!fields.gender.value) {
        const match = line.match(/(?:sex|gender)[:\s]+([MFX]|MALE|FEMALE)/i);
        if (match) {
          const val = match[1].toUpperCase().startsWith('M') ? 'M' : match[1].toUpperCase().startsWith('F') ? 'F' : 'X';
          fields.gender = { value: val, confidence: 0.92 };
        }
      }
    }

    return fields;
  }
}
