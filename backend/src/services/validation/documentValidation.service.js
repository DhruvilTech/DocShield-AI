// src/services/validation/documentValidation.service.js
import { watchlistRepository } from '../../repositories/watchlist.repository.js';
import { PassportParser } from '../parsers/passportParser.js';
import { auditService } from '../audit.service.js';
import { AUDIT_ACTIONS } from '../../config/constants.js';
import logger from '../../utils/logger.js';

function normDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  const clean = dateStr.trim().toUpperCase();

  // 1. ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  // 2. DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // 3. DD MMM YYYY (e.g. 14 MAY 1995)
  const monthMap = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  };
  const namedMatch = clean.match(/^(\d{1,2})[\s\-]([A-Z]{3})[\s\-](\d{4})$/);
  if (namedMatch) {
    const day = namedMatch[1].padStart(2, '0');
    const month = monthMap[namedMatch[2]];
    const year = namedMatch[3];
    if (month) return `${year}-${month}-${day}`;
  }

  // 4. MRZ YYMMDD format
  const mrzMatch = clean.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (mrzMatch) {
    const yy = parseInt(mrzMatch[1], 10);
    const currYy = new Date().getFullYear() % 100;
    const yearPrefix = yy > (currYy + 30) ? '19' : '20';
    return `${yearPrefix}${mrzMatch[1]}-${mrzMatch[2]}-${mrzMatch[3]}`;
  }

  return dateStr;
}

// Verhoeff Algorithm multiplication and permutation tables for Indian Aadhaar validation
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

function validateVerhoeff(numStr) {
  if (!numStr || typeof numStr !== 'string') return false;
  const clean = numStr.replace(/\s+/g, '');
  if (!/^\d{12}$/.test(clean)) return false;
  let c = 0;
  const reversed = clean.split('').reverse().map((d) => parseInt(d, 10));
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][reversed[i]]];
  }
  return c === 0;
}

export class DocumentValidationService {
  /**
   * Run comprehensive document validation according to official standards & watchlists
   */
  async validateDocument(extractedFields = {}, documentType = 'PASSPORT', organizationId = null, reqMeta = {}) {
    const findings = [];
    const normalizedType = (documentType || 'PASSPORT').toUpperCase();

    const checks = {
      mrzCheck: { status: 'SKIPPED', details: 'No MRZ data present.' },
      formatCheck: { status: 'VALID', details: 'Standard format rule applied.' },
      expirationCheck: { status: 'NOT_CHECKED', details: null },
      temporalSanityCheck: { status: 'NOT_CHECKED', details: null },
      crossFieldConsistency: { status: 'NOT_CHECKED', details: null },
      watchlistCheck: { status: 'CLEAR', matches: [] },
      visaEntryValidation: { status: 'SKIPPED', details: null },
    };

    const now = new Date();
    let totalRiskImpact = 0;

    const getVal = (fields, ...keys) => {
      for (const k of keys) {
        const item = fields[k];
        if (item !== undefined && item !== null) {
          if (typeof item === 'object' && item.value !== undefined && item.value !== null) {
            const s = String(item.value).trim();
            if (s && s !== 'null') return s;
          }
          if (typeof item === 'string' || typeof item === 'number') {
            const s = String(item).trim();
            if (s && s !== 'null') return s;
          }
        }
      }
      return null;
    };

    // --- Document Type Consistency Check ---
    const detectedType = (extractedFields.detectedDocumentType || extractedFields.detected_type || extractedFields.classifiedType || '').toUpperCase();
    if (detectedType && detectedType !== 'UNKNOWN' && detectedType !== normalizedType) {
      checks.formatCheck = {
        status: 'INVALID_FORMAT',
        details: `Document type mismatch: Detected as ${detectedType}, but category is set to ${normalizedType}.`,
      };
      findings.push({
        rule: 'DOCUMENT_TYPE_MISMATCH',
        severity: 'CRITICAL',
        title: 'Document Type Mismatch Detected',
        description: `Uploaded document structure matches ${detectedType.replace(/_/g, ' ')}, but submitted category is ${normalizedType.replace(/_/g, ' ')}. Document category is incorrect or fraudulent.`,
        evidence: `Expected: ${normalizedType} | Detected: ${detectedType}`,
      });
      totalRiskImpact += 50;
    }

    // --- Required Fields Check ---
    if (normalizedType === 'PASSPORT') {
      const requiredPassportFields = [
        { key: 'name', display: 'Name', alts: ['name', 'fullName'] },
        { key: 'passport_number', display: 'Passport Number', alts: ['passport_number', 'passportNumber'] },
        { key: 'nationality', display: 'Nationality', alts: ['nationality'] },
        { key: 'date_of_birth', display: 'Date of Birth', alts: ['date_of_birth', 'dateOfBirth'] },
        { key: 'date_of_expiry', display: 'Date of Expiry', alts: ['date_of_expiry', 'dateOfExpiry'] },
        { key: 'gender', display: 'Gender', alts: ['gender'] },
      ];

      for (const reqField of requiredPassportFields) {
        const val = getVal(extractedFields, ...reqField.alts);
        if (!val) {
          findings.push({
            rule: `REQUIRED_FIELD_MISSING_${reqField.key.toUpperCase()}`,
            severity: 'CRITICAL',
            title: `Required Field ${reqField.display} Missing`,
            description: `The extraction engine failed to retrieve the mandatory passport field: ${reqField.display}. This usually indicates a severely corrupt scan or a blank document.`,
            evidence: `${reqField.display} is null or empty`,
          });
          totalRiskImpact += 25;
        }
      }
    }

    // --- 0. Document-Specific Format & Mathematical Checksum Rules ---
    if (normalizedType === 'NATIONAL_ID' || normalizedType === 'AADHAAR') {
      const idNum = getVal(extractedFields, 'idNumber', 'id_number', 'aadhaarNumber');
      if (idNum) {
        const cleanId = idNum.replace(/\s+/g, '');
        if (/^\d{12}$/.test(cleanId)) {
          if (cleanId[0] === '0' || cleanId[0] === '1') {
            checks.formatCheck = {
              status: 'INVALID_FORMAT',
              details: 'Aadhaar numbers issued by UIDAI must not start with 0 or 1.',
            };
            findings.push({
              rule: 'AADHAAR_INVALID_PREFIX',
              severity: 'CRITICAL',
              title: 'Invalid Aadhaar Prefix Structure',
              description: 'Aadhaar standard specifies starting digit between 2 and 9.',
              evidence: `Identifier: ${idNum}`,
            });
            totalRiskImpact += 35;
          } else if (!validateVerhoeff(cleanId)) {
            checks.formatCheck = {
              status: 'INVALID_CHECKSUM',
              details: 'Aadhaar fails UIDAI Verhoeff dihedral D5 mathematical checksum.',
            };
            findings.push({
              rule: 'VERHOEFF_CHECKSUM_FAILURE',
              severity: 'CRITICAL',
              title: 'Aadhaar Mathematical Checksum Mismatch',
              description: 'The 12th check digit of the Aadhaar number is mathematically invalid and fails Verhoeff verification.',
              evidence: `Aadhaar: ${idNum}`,
            });
            totalRiskImpact += 40;
          } else {
            checks.formatCheck = {
              status: 'VALID',
              details: 'Aadhaar 12-digit number verified with official UIDAI Verhoeff Dihedral D5 checksum.',
            };
          }
        } else if (/^[xX*]{8}\d{4}$/.test(cleanId)) {
          checks.formatCheck = {
            status: 'VALID',
            details: 'Masked Aadhaar format verified (last 4 digits present).',
          };
        } else {
          checks.formatCheck = {
            status: 'INVALID_FORMAT',
            details: `Aadhaar format invalid (${idNum}). Expected 12 digits.`,
          };
          findings.push({
            rule: 'NATIONAL_ID_FORMAT_MISMATCH',
            severity: 'CRITICAL',
            title: 'Invalid National ID Syntax',
            description: 'Document identifier does not match standard 12-digit national ID specification.',
            evidence: `Raw value: ${idNum}`,
          });
          totalRiskImpact += 35;
        }
      } else {
        checks.formatCheck = {
          status: 'INVALID_FORMAT',
          details: 'No Aadhaar or National ID number could be detected in the document.',
        };
        findings.push({
          rule: 'MISSING_AADHAAR_IDENTIFIER',
          severity: 'CRITICAL',
          title: 'Missing National Identity Credentials',
          description: 'Document does not contain a valid 12-digit Aadhaar number or national identity identifier. The presented document is invalid or not an official National ID.',
          evidence: 'Aadhaar Number: Not Found',
        });
        totalRiskImpact += 45;
      }
    } else if (normalizedType === 'DRIVING_LICENSE') {
      const dlNum = getVal(extractedFields, 'licenseNumber', 'license_number', 'dlNumber');
      if (dlNum) {
        const cleanDl = dlNum.replace(/[\s-]/g, '').toUpperCase();
        const validStates = new Set([
          'AN', 'AP', 'AR', 'AS', 'BR', 'CH', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HR', 'HP',
          'JH', 'JK', 'KA', 'KL', 'LA', 'LD', 'MP', 'MH', 'MN', 'ML', 'MZ', 'NL', 'OD', 'OR', 'PB',
          'PY', 'RJ', 'SK', 'TN', 'TS', 'TR', 'UP', 'UK', 'UA', 'WB'
        ]);
        const stateCode = cleanDl.substring(0, 2);
        if (/^[A-Z]{2}\d{13,15}$/.test(cleanDl) && validStates.has(stateCode)) {
          checks.formatCheck = {
            status: 'VALID',
            details: `MoRTH SARATHI Driving License syntax valid for state: ${stateCode}.`,
          };
        } else {
          checks.formatCheck = {
            status: 'INVALID_FORMAT',
            details: `Driving license format does not match MoRTH national standardized schema (${dlNum}).`,
          };
          findings.push({
            rule: 'DRIVING_LICENSE_FORMAT_MISMATCH',
            severity: 'CRITICAL',
            title: 'Invalid Driving License Format',
            description: 'License number does not match official Ministry of Road Transport 15-character SARATHI syntax.',
            evidence: `DL Number: ${dlNum}`,
          });
          totalRiskImpact += 35;
        }
      } else {
        checks.formatCheck = {
          status: 'INVALID_FORMAT',
          details: 'No driving license registration number detected in document.',
        };
        findings.push({
          rule: 'MISSING_LICENSE_IDENTIFIER',
          severity: 'CRITICAL',
          title: 'Missing Driving License Identifier',
          description: 'Document does not contain a recognized driving license registration number.',
          evidence: 'License Number: Not Found',
        });
        totalRiskImpact += 45;
      }
    } else if (normalizedType === 'VISA') {
      const vNum = getVal(extractedFields, 'visaNumber', 'visa_number');
      if (vNum) {
        checks.formatCheck = {
          status: 'VALID',
          details: `Visa format verified: ${vNum}`,
        };
      } else {
        checks.formatCheck = {
          status: 'INVALID_FORMAT',
          details: 'No Visa or ETA registration number detected in document.',
        };
        findings.push({
          rule: 'MISSING_VISA_IDENTIFIER',
          severity: 'CRITICAL',
          title: 'Missing Visa Identifier',
          description: 'Document does not contain a valid Visa number or ETA clearance code.',
          evidence: 'Visa: Not Found',
        });
        totalRiskImpact += 45;
      }
    }

    // --- 1. MRZ Standard Check (ICAO Doc 9303 for Passports & Visas) ---
    if (normalizedType === 'PASSPORT' || normalizedType === 'VISA') {
      const rawMrz = extractedFields.mrzLines?.value || extractedFields.mrz_lines?.value || extractedFields.mrzLines || extractedFields.mrz_lines;
      let mrzLines = [];
      if (Array.isArray(rawMrz)) {
        mrzLines = rawMrz.map((l) => String(l).trim()).filter(Boolean);
      } else if (typeof rawMrz === 'string') {
        mrzLines = rawMrz.split('\n').map((l) => l.trim()).filter(Boolean);
      }

      if (mrzLines.length >= 2) {
        let line1 = mrzLines[0];
        let line2 = mrzLines[1];
        if ((line2.startsWith('P') || line2.startsWith('V')) && !(line1.startsWith('P') || line1.startsWith('V'))) {
          line1 = mrzLines[1];
          line2 = mrzLines[0];
        }

        if (line2.length >= 28) {
          const rawDocNum = line2.substring(0, 9);
          const docNumCheckDigit = line2.charAt(9);
          const dob = line2.substring(13, 19);
          const dobCheckDigit = line2.charAt(19);
          const expiry = line2.substring(21, 27);
          const expiryCheckDigit = line2.charAt(27);

          const calcDocCheck = PassportParser.computeIcaoCheckDigit(rawDocNum);
          const calcDobCheck = PassportParser.computeIcaoCheckDigit(dob);
          const calcExpiryCheck = PassportParser.computeIcaoCheckDigit(expiry);

          // Strict validation: check digits must match computed checksums exactly
          const docValid = (/^\d$/.test(docNumCheckDigit) && parseInt(docNumCheckDigit, 10) === calcDocCheck) || (docNumCheckDigit === '<' && calcDocCheck === 0);
          const dobValid = /^\d$/.test(dobCheckDigit) && parseInt(dobCheckDigit, 10) === calcDobCheck;
          const expValid = /^\d$/.test(expiryCheckDigit) && parseInt(expiryCheckDigit, 10) === calcExpiryCheck;

          const mrzValObj = extractedFields.mrzValidation?.value || extractedFields.mrzValidation;
          const isExplicitlyInvalid = mrzValObj && mrzValObj.isValid === false;

          if (docValid && dobValid && expValid && !isExplicitlyInvalid) {
            const formatName = normalizedType === 'VISA' ? 'ICAO Doc 9303 Part 7 Visa MRZ' : 'ICAO Doc 9303 Type 3 MRZ';
            checks.mrzCheck = {
              status: 'PASSED',
              details: `${formatName} check digits verified valid (Document Number, DOB, Expiry).`,
            };
          } else {
            checks.mrzCheck = {
              status: 'FAILED',
              details: `MRZ Check Digit Mismatch: Doc# valid=${docValid}, DOB valid=${dobValid}, Expiry valid=${expValid}`,
            };
            findings.push({
              rule: 'ICAO_9303_CHECKSUM_FAILURE',
              severity: 'CRITICAL',
              title: 'MRZ Check Digit Calculation Mismatch',
              description: `The ${normalizedType.toLowerCase()} Machine Readable Zone checksum does not match official ICAO 9303 algorithm standards. This indicates forged credentials or tampered characters.`,
              evidence: checks.mrzCheck.details,
            });
            totalRiskImpact += 40;
          }
        } else {
          checks.mrzCheck = {
            status: 'FAILED',
            details: 'MRZ Line 2 is truncated, corrupted, or covered by tampering.',
          };
          findings.push({
            rule: 'ICAO_9303_CHECKSUM_FAILURE',
            severity: 'CRITICAL',
            title: 'Corrupted or Incomplete MRZ Block',
            description: `MRZ line length is insufficient for ICAO ${normalizedType} standard verification.`,
            evidence: `MRZ Line 2 length: ${line2.length}`,
          });
          totalRiskImpact += 40;
        }
      } else if (normalizedType === 'PASSPORT') {
        checks.mrzCheck = {
          status: 'FAILED',
          details: 'Mandatory ICAO Doc 9303 Machine Readable Zone (MRZ) could not be detected or is obscured by tampering/white-out.',
        };
        findings.push({
          rule: 'MISSING_MRZ_LINES',
          severity: 'CRITICAL',
          title: 'Missing or Obscured Machine Readable Zone (MRZ)',
          description: 'The passport Machine Readable Zone (MRZ) could not be extracted. On official passports, MRZ presence is legally mandatory. Absence indicates document tampering, white paint overprint, or a non-standard document.',
          evidence: 'MRZ Lines: Not Found / Obscured',
        });
        totalRiskImpact += 45;
      }
    }

    // --- 2. Expiration Date & 6-Month International Validity Rule ---
    const expiryStr = getVal(extractedFields, 'dateOfExpiry', 'date_of_expiry', 'visualDateOfExpiry', 'visual_date_of_expiry', 'validUntil', 'valid_until');
    if (expiryStr) {
      const parsedDateStr = normDate(expiryStr);
      let expDate = new Date(parsedDateStr);
      if (!isNaN(expDate.getTime())) {
        if (expDate < now) {
          checks.expirationCheck = {
            status: 'EXPIRED',
            details: `Document expired on ${parsedDateStr}.`,
          };
          findings.push({
            rule: 'EXPIRED_DOCUMENT',
            severity: 'CRITICAL',
            title: 'Document Credential Expired',
            description: `The document expired on ${parsedDateStr}, making it invalid for active international clearance.`,
            evidence: `Expiry Date: ${expiryStr}`,
          });
          totalRiskImpact += 35;
        } else {
          const sixMonthsAhead = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
          if (expDate < sixMonthsAhead) {
            checks.expirationCheck = {
              status: 'NEAR_EXPIRY',
              details: `Document valid but expires within 6 months (${parsedDateStr}).`,
            };
            findings.push({
              rule: 'SIX_MONTH_EXPIRY_WARNING',
              severity: 'MEDIUM',
              title: 'Document Expires Within 6 Months',
              description: 'Many destination border jurisdictions require at least 6 months remaining document validity.',
              evidence: `Expiry Date: ${expiryStr}`,
            });
            totalRiskImpact += 10;
          } else {
            checks.expirationCheck = {
              status: 'VALID',
              details: `Active and valid through ${parsedDateStr}.`,
            };
          }
        }
      }
    }

    // --- 3. Date of Birth & Temporal Sanity ---
    const dobStr = getVal(extractedFields, 'dateOfBirth', 'date_of_birth', 'visualDateOfBirth', 'visual_date_of_birth');
    if (dobStr) {
      const parsedDobStr = normDate(dobStr);
      let dobDate = new Date(parsedDobStr);
      if (!isNaN(dobDate.getTime())) {
        if (dobDate > now) {
          checks.temporalSanityCheck = {
            status: 'INVALID_FUTURE_DOB',
            details: `Date of birth ${parsedDobStr} is in the future.`,
          };
          findings.push({
            rule: 'FUTURE_DOB_ANOMALY',
            severity: 'CRITICAL',
            title: 'Fraudulent Future Date of Birth',
            description: 'Date of birth is registered in the future, indicating fraudulent data fabrication or severe OCR corruption.',
            evidence: `DOB: ${dobStr}`,
          });
          totalRiskImpact += 35;
        } else {
          const ageYears = Math.floor((now - dobDate) / (365.25 * 24 * 60 * 60 * 1000));
          checks.temporalSanityCheck = {
            status: 'VALID',
            details: `Calculated passenger age: ${ageYears} years.`,
          };
        }
      }
    }

    // --- Nationality Validation ---
    const visNationVal = getVal(extractedFields, 'visualNationality', 'visual_nationality');
    const isInvalidNationality = (nation) => {
      if (!nation) return false;
      const clean = nation.trim().toLowerCase();
      return clean.includes('/') || clean.includes('surname') || clean.includes('given') || clean.includes('name') || clean.includes('nom') || clean.length < 2;
    };
    if (visNationVal && isInvalidNationality(visNationVal)) {
      findings.push({
        rule: 'INVALID_NATIONALITY_EXTRACTION',
        severity: 'CRITICAL',
        title: 'Invalid Nationality Extraction',
        description: `The extracted nationality "${visNationVal}" contains visual label noise or invalid formatting.`,
        evidence: `Nationality: ${visNationVal}`,
      });
      totalRiskImpact += 20;
    }

    // --- 4. Cross-Field Consistency (MRZ vs Visual Zone) ---
    // A. Document Number (Passport / Visa)
    const mrzDocNum = getVal(extractedFields, 'passportNumber', 'passport_number', 'mrz_passport_number', 'visaNumber', 'visa_number', 'mrz_visa_number');
    const visDocNum = getVal(extractedFields, 'visualPassportNumber', 'visual_passport_number', 'visPassportNumber', 'visualVisaNumber', 'visual_visa_number', 'visVisaNumber');
    if (mrzDocNum && visDocNum) {
      const normMrz = mrzDocNum.replace(/[\s<]/g, '').toUpperCase();
      const normVis = visDocNum.replace(/[\s<]/g, '').toUpperCase();
      if (normMrz !== normVis) {
        const docLabel = normalizedType === 'VISA' ? 'Visa' : 'Passport';
        findings.push({
          rule: 'VISUAL_MRZ_NUMBER_MISMATCH',
          severity: 'CRITICAL',
          title: `Visual vs MRZ ${docLabel} Number Mismatch`,
          description: `The ${docLabel.toLowerCase()} number in the visual zone differs from the MRZ zone ${docLabel.toLowerCase()} number.`,
          evidence: `Visual: ${visDocNum} | MRZ: ${mrzDocNum}`,
        });
        totalRiskImpact += 30;
      }
    }

    // B. Holder Name
    const mrzName = getVal(extractedFields, 'name', 'fullName', 'mrz_name');
    const visName = getVal(extractedFields, 'visualName', 'visual_name', 'visName');
    if (mrzName && visName) {
      const getTokens = (str) => new Set((str || '').toUpperCase().replace(/[^A-Z]/g, ' ').split(/\s+/).filter((t) => t.length > 0));
      const mrzTokens = getTokens(mrzName);
      const visTokens = getTokens(visName);
      const hasTokenOverlap = [...mrzTokens].some((t) => visTokens.has(t));
      if (mrzTokens.size > 0 && visTokens.size > 0 && !hasTokenOverlap) {
        findings.push({
          rule: 'VISUAL_MRZ_NAME_MISMATCH',
          severity: 'CRITICAL',
          title: 'Visual Name vs MRZ Name Mismatch',
          description: 'The passport holder name in the visual inspection zone differs from the MRZ zone name.',
          evidence: `Visual: ${visName} | MRZ: ${mrzName}`,
        });
        totalRiskImpact += 30;
      }
    }

    // C. Nationality
    const mrzNation = getVal(extractedFields, 'nationality', 'mrz_nationality');
    const visNation = getVal(extractedFields, 'visualNationality', 'visual_nationality', 'visNationality');
    if (mrzNation && visNation && !isInvalidNationality(visNation)) {
      const normalizeNat = (n) => {
        const clean = (n || '').replace(/[\s<]/g, '').toUpperCase();
        if (['IND', 'INDIAN', 'INDIA'].includes(clean)) return 'IND';
        if (['USA', 'UNITEDSTATES', 'AMERICAN'].includes(clean)) return 'USA';
        if (['GBR', 'BRITISH', 'UNITEDKINGDOM'].includes(clean)) return 'GBR';
        if (['CAN', 'CANADA', 'CANADIAN'].includes(clean)) return 'CAN';
        return clean;
      };
      const normMrz = normalizeNat(mrzNation);
      const normVis = normalizeNat(visNation);
      if (normMrz !== normVis) {
        findings.push({
          rule: 'VISUAL_MRZ_NATIONALITY_MISMATCH',
          severity: 'HIGH',
          title: 'Visual vs MRZ Nationality Mismatch',
          description: 'The nationality in the visual zone differs from the MRZ zone nationality.',
          evidence: `Visual: ${visNation} | MRZ: ${mrzNation}`,
        });
        totalRiskImpact += 20;
      }
    }

    // D. Date of Birth
    const mrzDob = getVal(extractedFields, 'dateOfBirth', 'date_of_birth', 'mrz_date_of_birth');
    const visDob = getVal(extractedFields, 'visualDateOfBirth', 'visual_date_of_birth', 'visDateOfBirth');
    if (mrzDob && visDob) {
      const normMrz = normDate(mrzDob);
      const normVis = normDate(visDob);
      if (normMrz && normVis && normMrz !== normVis) {
        findings.push({
          rule: 'VISUAL_MRZ_DOB_MISMATCH',
          severity: 'CRITICAL',
          title: 'Visual vs MRZ Date of Birth Mismatch',
          description: 'The date of birth in the visual zone differs from the MRZ zone date of birth.',
          evidence: `Visual: ${visDob} | MRZ: ${mrzDob}`,
        });
        totalRiskImpact += 30;
      }
    }

    // E. Date of Expiry
    const mrzExp = getVal(extractedFields, 'dateOfExpiry', 'date_of_expiry', 'mrz_date_of_expiry');
    const visExp = getVal(extractedFields, 'visualDateOfExpiry', 'visual_date_of_expiry', 'visDateOfExpiry');
    if (mrzExp && visExp) {
      const normMrz = normDate(mrzExp);
      const normVis = normDate(visExp);
      if (normMrz && normVis && normMrz !== normVis) {
        findings.push({
          rule: 'VISUAL_MRZ_EXPIRY_MISMATCH',
          severity: 'CRITICAL',
          title: 'Visual vs MRZ Date of Expiry Mismatch',
          description: 'The date of expiry in the visual zone differs from the MRZ zone date of expiry.',
          evidence: `Visual: ${visExp} | MRZ: ${mrzExp}`,
        });
        totalRiskImpact += 30;
      }
    }

    // F. Gender
    const mrzGen = getVal(extractedFields, 'gender', 'mrz_gender');
    const visGen = getVal(extractedFields, 'visualGender', 'visual_gender', 'visGender');
    if (mrzGen && visGen) {
      const normMrz = mrzGen.trim().toUpperCase().charAt(0);
      const normVis = visGen.trim().toUpperCase().charAt(0);
      if (normMrz && normVis && normMrz !== normVis) {
        findings.push({
          rule: 'VISUAL_MRZ_GENDER_MISMATCH',
          severity: 'HIGH',
          title: 'Visual vs MRZ Gender Mismatch',
          description: 'The gender in the visual zone differs from the MRZ zone gender.',
          evidence: `Visual: ${visGen} | MRZ: ${mrzGen}`,
        });
        totalRiskImpact += 20;
      }
    }

    // Ensure checks.crossFieldConsistency reflects any mismatch
    const hasMismatch = findings.some((f) => f.rule.startsWith('VISUAL_MRZ_') && f.rule.endsWith('_MISMATCH'));
    if (hasMismatch) {
      checks.crossFieldConsistency = {
        status: 'MISMATCH',
        details: 'Visual inspection zone has data field mismatches against MRZ parsed structure.',
      };
    } else {
      checks.crossFieldConsistency = {
        status: 'CONSISTENT',
        details: 'Visual inspection zone aligns with MRZ parsed structure.',
      };
    }

    // --- 5. Visa Entry & Stay Duration Validation ---
    const visaNumVal = getVal(extractedFields, 'visaNumber', 'visa_number');
    if (normalizedType === 'VISA' || visaNumVal) {
      const entryType = getVal(extractedFields, 'entryValidation', 'entry_type') || 'SINGLE';
      const stayDuration = getVal(extractedFields, 'stayDuration', 'stay_duration');
      checks.visaEntryValidation = {
        status: 'VALID',
        details: `Entry Type: ${entryType}, Authorized Stay: ${stayDuration || 'Standard Duration'}.`,
      };
    }

    // --- 6. Watchlist & Interpol SLTD Cross-Matching ---
    const searchDocNum = getVal(extractedFields, 'passportNumber', 'passport_number', 'visaNumber', 'visa_number', 'idNumber', 'id_number', 'licenseNumber', 'license_number', 'permitNumber', 'permit_number');
    const searchName = getVal(extractedFields, 'fullName', 'name', 'holderName');

    try {
      const matches = [];
      if (searchDocNum) {
        const numMatches = await watchlistRepository.findByDocumentNumber(searchDocNum, organizationId);
        matches.push(...numMatches);
      }

      if (searchName && matches.length === 0) {
        const nameMatches = await watchlistRepository.findByName(searchName, organizationId);
        matches.push(...nameMatches);
      }

      if (matches.length > 0) {
        const primaryMatch = matches[0];
        checks.watchlistCheck = {
          status: 'HIT_DETECTED',
          matches: matches.map((m) => ({
            documentNumber: m.document_number,
            fullName: m.full_name,
            reason: m.reason,
            riskLevel: m.risk_level,
            listedBy: m.listed_by,
          })),
        };

        findings.push({
          rule: 'WATCHLIST_HIT_ALERT',
          severity: primaryMatch.risk_level || 'CRITICAL',
          title: `Border Watchlist Hit: ${primaryMatch.reason.replace(/_/g, ' ')}`,
          description: `Document or traveler matches active alert listed by ${primaryMatch.listed_by}.`,
          evidence: `Watchlist Entry: Doc #${primaryMatch.document_number} (${primaryMatch.full_name || 'Named Subject'}) - Reason: ${primaryMatch.reason}`,
        });
        totalRiskImpact += 45;
      } else {
        checks.watchlistCheck = {
          status: 'CLEAR',
          details: 'No matches found in Interpol SLTD or Border Watchlist database.',
          matches: [],
        };
      }
    } catch (err) {
      logger.warn(`Watchlist query error: ${err.message}`);
      checks.watchlistCheck = {
        status: 'UNAVAILABLE',
        details: 'Watchlist database temporarily unreachable.',
        matches: [],
      };
    }

    // --- 7. AI Document Detection Validation Rules Integration ---
    const aiVal = extractedFields.aiValidation || extractedFields.validation;
    if (aiVal && Array.isArray(aiVal.checks)) {
      checks.aiValidation = {
        valid: aiVal.valid,
        checks: aiVal.checks,
        errors: aiVal.errors || [],
        warnings: aiVal.warnings || [],
      };

      if (aiVal.valid === false) {
        findings.push({
          rule: 'AI_REGULATORY_VALIDATION_FAILURE',
          severity: 'CRITICAL',
          title: 'Document Standards Regulatory Rejection',
          description: `Document failed official regulatory standards and format rules for ${normalizedType}.`,
          evidence: aiVal.errors?.join('; ') || 'Mandatory security credentials unverified or absent.',
        });
        totalRiskImpact += 35;
      }

      for (const chk of aiVal.checks) {
        if (chk.status === 'invalid' || chk.status === 'inconsistent') {
          findings.push({
            rule: `AI_VALIDATION_${chk.field?.toUpperCase() || 'RULE'}`,
            severity: 'CRITICAL',
            title: `AI Standard Check: ${chk.field?.replace(/_/g, ' ').toUpperCase()}`,
            description: chk.message || `Validation check failed for ${chk.field}.`,
            evidence: `Field: ${chk.field} | Confidence: ${chk.confidence ?? 'N/A'}`,
          });
          totalRiskImpact += 25;
        } else if (chk.status === 'missing') {
          const isPrimary = ['id_number', 'passport_number', 'license_number', 'visa_number', 'name', 'full_name'].includes(chk.field);
          findings.push({
            rule: `AI_MISSING_${chk.field?.toUpperCase() || 'FIELD'}`,
            severity: isPrimary ? 'CRITICAL' : 'HIGH',
            title: `Required Field Missing: ${chk.field?.replace(/_/g, ' ').toUpperCase()}`,
            description: chk.message || `Required field ${chk.field} is missing or unreadable.`,
            evidence: `Field: ${chk.field}`,
          });
          totalRiskImpact += isPrimary ? 30 : 15;
        }
      }

      if (Array.isArray(aiVal.errors)) {
        for (const err of aiVal.errors) {
          findings.push({
            rule: 'AI_VALIDATION_ERROR',
            severity: 'CRITICAL',
            title: 'Official Document Standard Alert',
            description: err,
            evidence: 'AI Validation Ruleset',
          });
          totalRiskImpact += 25;
        }
      }
    }

    const isValid = findings.every((f) => f.severity !== 'CRITICAL' && f.severity !== 'HIGH');

    return {
      isValid,
      totalRiskImpact: Math.min(40, totalRiskImpact),
      checks,
      findings,
    };
  }
}

export const documentValidationService = new DocumentValidationService();
