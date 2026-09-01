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
      surname: { value: null, confidence: 0 },
      givenNames: { value: null, confidence: 0 },
      passportNumber: { value: null, confidence: 0 },
      nationality: { value: null, confidence: 0 },
      dateOfBirth: { value: null, confidence: 0 },
      dateOfIssue: { value: null, confidence: 0 },
      dateOfExpiry: { value: null, confidence: 0 },
      placeOfBirth: { value: null, confidence: 0 },
      placeOfIssue: { value: null, confidence: 0 },
      gender: { value: null, confidence: 0 },
      personalNumber: { value: null, confidence: 0 },
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
    const mrzCandidates = lines
      .map((l) => l.replace(/\s/g, '').replace(/[([{\]_]/g, '<').toUpperCase())
      .filter((l) => /P[<A-Z0-9]{35,48}/.test(l) || /^[A-Z0-9<]{40,48}$/.test(l));

    if (mrzCandidates.length >= 2) {
      let line1 = mrzCandidates[0];
      let line2 = mrzCandidates[1];

      // Swap lines if line2 starts with P and line1 does not
      if (line2.startsWith('P') && !line1.startsWith('P')) {
        const tmp = line1;
        line1 = line2;
        line2 = tmp;
      }

      fields.mrzLines = { value: [line1, line2], confidence: 0.98 };

      // Line 1: P<INDLASTNAME<<FIRSTNAME<MIDDLENAME<<<<<<<<<<<<<<<<<<
      if (line1.startsWith('P<') || line1.startsWith('P')) {
        const country = line1.substring(2, 5).replace(/</g, '');
        const nameRaw = line1.substring(5);
        const nameParts = nameRaw.split('<<');
        const surname = nameParts[0] ? nameParts[0].replace(/</g, ' ').trim() : '';
        const givenNames = nameParts[1] ? nameParts[1].replace(/</g, ' ').trim() : '';
        const fullName = `${surname} ${givenNames}`.trim() || `${givenNames} ${surname}`.trim();

        if (surname) fields.surname = { value: surname, confidence: 0.95 };
        if (givenNames) fields.givenNames = { value: givenNames, confidence: 0.95 };
        if (fullName) fields.fullName = { value: fullName, confidence: 0.95 };
        if (country) {
          fields.issuingCountry = { value: country, confidence: 0.95 };
          fields.nationality = { value: country, confidence: 0.95 };
        }
      }

      // Line 2: AT983807<0IND0608266M36062963067652860226<36
      // or E7251023<2IND8101246M13111303<<<<<<<<<<<<<<2
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

        // Optional personal data (positions 28-42)
        if (line2.length >= 42) {
          const optData = line2.substring(28, 42).replace(/</g, '');
          if (optData) {
            fields.personalNumber = { value: optData, confidence: 0.95 };
          }
        }

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
      // Passport Number (Support 1 letter + 7 digits e.g. E7251023 or 2 letters + 6 digits e.g. AT983807)
      if (!fields.passportNumber.value) {
        const match = line.match(/(?:passport\s*(?:no|number|#)?|no\s*du\s*passeport)[:\s]+([A-Z0-9]{7,10})/i) ||
                      line.match(/\b([A-Z]{1,2}[0-9]{6,7})\b/);
        if (match) {
          fields.passportNumber = { value: match[1].toUpperCase().replace(/\s/g, ''), confidence: 0.90 };
        }
      }

      // Surname
      if (!fields.surname.value) {
        const match = line.match(/(?:surname\s*(?:\/\s*nom)?|last\s*name)[:\s]+([A-Za-z\s\.\-]{2,40})/i);
        if (match) {
          const clean = match[1].replace(/\([^)]*\)/g, '').replace(/^[/:\s.\-]+/, '').trim();
          if (clean && !/^(nom|surname|passport|number|republic|identity|department|country)$/i.test(clean)) {
            fields.surname = { value: clean, confidence: 0.90 };
          }
        }
      }

      // Given Names
      if (!fields.givenNames.value) {
        const match = line.match(/(?:given\s*names?\s*(?:\(s\))?\s*(?:\/\s*pr[eé]noms?)?|first\s*name)[:\s]+([A-Za-z\s\.\-]{2,40})/i);
        if (match) {
          const clean = match[1].replace(/\([^)]*\)/g, '').replace(/^[/:\s.\-]+/, '').trim();
          if (clean && !/^(pr[eé]noms?|given|name|passport|number|republic|identity|department|\(s\)|s)$/i.test(clean)) {
            fields.givenNames = { value: clean, confidence: 0.90 };
          }
        }
      }

      // Full Name
      if (!fields.fullName.value) {
        if (fields.surname.value && fields.givenNames.value) {
          fields.fullName = { value: `${fields.givenNames.value} ${fields.surname.value}`, confidence: 0.92 };
        } else {
          const match = line.match(/(?:name|full\s*name|holder)[:\s]+([A-Za-z\s\.\-]{3,40})/i);
          if (match) {
            const clean = match[1].replace(/\([^)]*\)/g, '').replace(/^[/:\s.\-]+/, '').trim();
            if (clean && !/^(passport|number|republic|identity|department|given|surname|\(s\)|s)$/i.test(clean)) {
              fields.fullName = { value: clean, confidence: 0.88 };
            }
          }
        }
      }

      // Nationality
      if (!fields.nationality.value) {
        const match = line.match(/(?:nationality\s*(?:\/\s*nationalit[eé])?|citizenship)[:\s]+([A-Za-z\s]{3,30})/i);
        if (match) {
          const clean = match[1].replace(/\([^)]*\)/g, '').replace(/^[/:\s.\-]+/, '').trim();
          if (clean && !/^(nationalit[eé]|nationality|type|code|passport|p)$/i.test(clean)) {
            fields.nationality = { value: clean, confidence: 0.89 };
          }
        }
      }

      // Gender
      if (!fields.gender.value) {
        const match = line.match(/(?:sex\s*(?:\/\s*sexe)?|gender)[:\s]+(MALE|FEMALE|HOMME|FEMME|[MFX])\b/i);
        if (match) {
          const g = match[1].toUpperCase();
          fields.gender = { value: (g.startsWith('M') || g === 'HOMME') ? 'M' : (g.startsWith('F') || g === 'FEMME') ? 'F' : 'X', confidence: 0.90 };
        }
      }

      // Date of Birth
      if (!fields.dateOfBirth.value) {
        const match = line.match(/(?:date\s*of\s*birth|dob|birth\s*date|date\s*de\s*naissance)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.dateOfBirth = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.90 };
        }
      }

      // Date of Issue
      if (!fields.dateOfIssue.value) {
        const match = line.match(/(?:date\s*of\s*issue|issue\s*date|date\s*de\s*d[eé]livrance|issued\s*on)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.dateOfIssue = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.90 };
        }
      }

      // Date of Expiry
      if (!fields.dateOfExpiry.value) {
        const match = line.match(/(?:date\s*of\s*expiry|expiration\s*date|valid\s*until|expiry\s*date|date\s*d['\s]?expiration)[:\s]+([0-9A-Za-z\/\-\.\s]{8,15})/i);
        if (match) {
          fields.dateOfExpiry = { value: TextNormalizer.standardizeDate(match[1]), confidence: 0.90 };
        }
      }

      // Place of Birth
      if (!fields.placeOfBirth.value) {
        const match = line.match(/(?:place\s*of\s*birth|lieu\s*de\s*naissance|birth\s*place)[:\s]+([A-Za-z\s\.\-]{2,40})/i);
        if (match && !/passport|issue|date|republic|state/i.test(match[1])) {
          fields.placeOfBirth = { value: match[1].trim(), confidence: 0.88 };
        }
      }

      // Place of Issue
      if (!fields.placeOfIssue.value) {
        const match = line.match(/(?:place\s*of\s*issue|lieu\s*de\s*d[eé]livrance|issue\s*place)[:\s]+([A-Za-z\s\.\-]{2,40})/i);
        if (match && !/passport|birth|date|republic|state/i.test(match[1])) {
          fields.placeOfIssue = { value: match[1].trim(), confidence: 0.88 };
        }
      }

      // Gender
      if (!fields.gender.value) {
        const match = line.match(/(?:sex|gender|sexe)[:\s]+([MFX]|MALE|FEMALE)/i);
        if (match) {
          const val = match[1].toUpperCase().startsWith('M') ? 'M' : match[1].toUpperCase().startsWith('F') ? 'F' : 'X';
          fields.gender = { value: val, confidence: 0.92 };
        }
      }
    }

    // Chronological fallback for dates if labels were missing
    if (!fields.dateOfBirth.value || !fields.dateOfExpiry.value) {
      const allDateMatches = text.match(/\b\d{2}[/\-.]\d{2}[/\-.]\d{4}\b/g);
      if (allDateMatches && allDateMatches.length >= 2) {
        const stdDates = Array.from(new Set(allDateMatches.map((d) => TextNormalizer.standardizeDate(d)))).sort();
        if (stdDates.length >= 3) {
          if (!fields.dateOfBirth.value) fields.dateOfBirth = { value: stdDates[0], confidence: 0.85 };
          if (!fields.dateOfIssue.value) fields.dateOfIssue = { value: stdDates[1], confidence: 0.85 };
          if (!fields.dateOfExpiry.value) fields.dateOfExpiry = { value: stdDates[2], confidence: 0.85 };
        } else if (stdDates.length === 2) {
          if (!fields.dateOfBirth.value) fields.dateOfBirth = { value: stdDates[0], confidence: 0.85 };
          if (!fields.dateOfExpiry.value) fields.dateOfExpiry = { value: stdDates[1], confidence: 0.85 };
        }
      }
    }

    return fields;
  }
}
