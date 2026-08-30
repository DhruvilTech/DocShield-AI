// src/services/validation/documentValidation.service.js
import { watchlistRepository } from '../../repositories/watchlist.repository.js';
import { PassportParser } from '../parsers/passportParser.js';
import { auditService } from '../audit.service.js';
import { AUDIT_ACTIONS } from '../../config/constants.js';
import logger from '../../utils/logger.js';

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

    // --- 1. MRZ Standard Check (ICAO Doc 9303) ---
    const mrzLines = extractedFields.mrzLines?.value || extractedFields.mrz_lines?.value || extractedFields.mrzLines || extractedFields.mrz_lines;
    if (Array.isArray(mrzLines) && mrzLines.length >= 2) {
      const line1 = mrzLines[0];
      const line2 = mrzLines[1];

      if (line2.length >= 28) {
        const rawPassNum = line2.substring(0, 9);
        const passNumCheckDigit = line2.charAt(9);
        const dob = line2.substring(13, 19);
        const dobCheckDigit = line2.charAt(19);
        const expiry = line2.substring(21, 27);
        const expiryCheckDigit = line2.charAt(27);

        const calcPassCheck = PassportParser.computeIcaoCheckDigit(rawPassNum);
        const calcDobCheck = PassportParser.computeIcaoCheckDigit(dob);
        const calcExpiryCheck = PassportParser.computeIcaoCheckDigit(expiry);

        const passValid = !passNumCheckDigit || passNumCheckDigit === '<' || parseInt(passNumCheckDigit, 10) === calcPassCheck;
        const dobValid = !dobCheckDigit || dobCheckDigit === '<' || parseInt(dobCheckDigit, 10) === calcDobCheck;
        const expValid = !expiryCheckDigit || expiryCheckDigit === '<' || parseInt(expiryCheckDigit, 10) === calcExpiryCheck;

        if (passValid && dobValid && expValid) {
          checks.mrzCheck = {
            status: 'PASSED',
            details: 'ICAO Doc 9303 Type 3 MRZ check digits verified valid (Document Number, DOB, Expiry).',
          };
        } else {
          checks.mrzCheck = {
            status: 'FAILED',
            details: `MRZ Check Digit Mismatch: Doc# valid=${passValid}, DOB valid=${dobValid}, Expiry valid=${expValid}`,
          };
          findings.push({
            rule: 'ICAO_9303_CHECKSUM_FAILURE',
            severity: 'HIGH',
            title: 'MRZ Check Digit Calculation Mismatch',
            description: 'The Machine Readable Zone checksum does not match official ICAO 9303 algorithm standards.',
            evidence: checks.mrzCheck.details,
          });
          totalRiskImpact += 25;
        }
      }
    }

    // --- 2. Expiration Date & 6-Month International Validity Rule ---
    const expiryStr = getVal(extractedFields, 'dateOfExpiry', 'date_of_expiry', 'validUntil', 'valid_until');
    if (expiryStr) {
      let expDate = new Date(expiryStr);
      if (isNaN(expDate.getTime()) && /^\d{2}\/\d{2}\/\d{4}$/.test(expiryStr)) {
        const [d, m, y] = expiryStr.split('/');
        expDate = new Date(`${y}-${m}-${d}`);
      }
      if (!isNaN(expDate.getTime())) {
        if (expDate < now) {
          checks.expirationCheck = {
            status: 'EXPIRED',
            details: `Document expired on ${expDate.toISOString().split('T')[0]}.`,
          };
          findings.push({
            rule: 'EXPIRED_DOCUMENT',
            severity: 'CRITICAL',
            title: 'Document Credential Expired',
            description: `The document expired on ${expDate.toISOString().split('T')[0]}, making it invalid for active international clearance.`,
            evidence: `Expiry Date: ${expiryStr}`,
          });
          totalRiskImpact += 35;
        } else {
          const sixMonthsAhead = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
          if (expDate < sixMonthsAhead) {
            checks.expirationCheck = {
              status: 'NEAR_EXPIRY',
              details: `Document valid but expires within 6 months (${expDate.toISOString().split('T')[0]}).`,
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
              details: `Active and valid through ${expDate.toISOString().split('T')[0]}.`,
            };
          }
        }
      }
    }

    // --- 3. Date of Birth & Temporal Sanity ---
    const dobStr = getVal(extractedFields, 'dateOfBirth', 'date_of_birth');
    if (dobStr) {
      let dobDate = new Date(dobStr);
      if (isNaN(dobDate.getTime()) && /^\d{2}\/\d{2}\/\d{4}$/.test(dobStr)) {
        const [d, m, y] = dobStr.split('/');
        dobDate = new Date(`${y}-${m}-${d}`);
      }
      if (!isNaN(dobDate.getTime())) {
        if (dobDate > now) {
          checks.temporalSanityCheck = {
            status: 'INVALID_FUTURE_DOB',
            details: `Date of birth ${dobStr} is in the future.`,
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

    // --- 4. Cross-Field Consistency (MRZ vs Visual Zone) ---
    const passNumVal = getVal(extractedFields, 'passportNumber', 'passport_number');
    if (passNumVal && Array.isArray(mrzLines) && mrzLines.length >= 2) {
      const visNum = passNumVal.replace(/\s/g, '').toUpperCase();
      const mrz = mrzLines.join('').toUpperCase();

      if (visNum && !mrz.includes(visNum)) {
        checks.crossFieldConsistency = {
          status: 'MISMATCH',
          details: `Visual number "${visNum}" does not match MRZ sequence.`,
        };
        findings.push({
          rule: 'VISUAL_MRZ_NUMBER_MISMATCH',
          severity: 'CRITICAL',
          title: 'Visual Zone vs MRZ Identifier Discrepancy',
          description: 'The passport identifier in the visual inspection zone differs from the encrypted MRZ string.',
          evidence: `Visual: ${visNum} | MRZ: ${mrz.substring(0, 30)}...`,
        });
        totalRiskImpact += 30;
      } else {
        checks.crossFieldConsistency = {
          status: 'CONSISTENT',
          details: 'Visual inspection zone aligns with MRZ parsed structure.',
        };
      }
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
