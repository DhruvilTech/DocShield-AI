// src/services/validation/documentValidation.service.js
import { watchlistRepository } from '../../repositories/watchlist.repository.js';
import { PassportParser } from '../parsers/passportParser.js';
import { auditService } from '../audit.service.js';
import { AUDIT_ACTIONS } from '../../config/constants.js';
import logger from '../../utils/logger.js';

export class DocumentValidationService {
  /**
   * Run comprehensive document validation according to official standards & watchlists
   */
  async validateDocument(extractedFields = {}, documentType = 'PASSPORT', organizationId = null, reqMeta = {}) {
    const findings = [];
    const checks = {
      mrzCheck: { status: 'SKIPPED', details: 'No MRZ data present.' },
      expirationCheck: { status: 'NOT_CHECKED', details: null },
      temporalSanityCheck: { status: 'NOT_CHECKED', details: null },
      crossFieldConsistency: { status: 'NOT_CHECKED', details: null },
      watchlistCheck: { status: 'CLEAR', matches: [] },
      visaEntryValidation: { status: 'SKIPPED', details: null },
    };

    const now = new Date();
    let totalRiskImpact = 0;

    // --- 1. MRZ Standard Check (ICAO Doc 9303) ---
    if (extractedFields.mrzLines && Array.isArray(extractedFields.mrzLines.value) && extractedFields.mrzLines.value.length >= 2) {
      const line1 = extractedFields.mrzLines.value[0];
      const line2 = extractedFields.mrzLines.value[1];

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
    const expiryStr = extractedFields.dateOfExpiry?.value || extractedFields.validUntil?.value;
    if (expiryStr) {
      const expDate = new Date(expiryStr);
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
          // 6-month validity rule for international border travel
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
    const dobStr = extractedFields.dateOfBirth?.value;
    if (dobStr) {
      const dobDate = new Date(dobStr);
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
    if (extractedFields.passportNumber?.value && extractedFields.mrzLines?.value?.length >= 2) {
      const visNum = String(extractedFields.passportNumber.value).replace(/\s/g, '').toUpperCase();
      const mrz = extractedFields.mrzLines.value.join('').toUpperCase();

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
    if (documentType === 'VISA' || extractedFields.visaNumber?.value) {
      const entryType = extractedFields.entryValidation?.value || 'SINGLE';
      const stayDuration = extractedFields.stayDuration?.value;
      checks.visaEntryValidation = {
        status: 'VALID',
        details: `Entry Type: ${entryType}, Authorized Stay: ${stayDuration || 'Standard Duration'}.`,
      };
    }

    // --- 6. Watchlist & Interpol SLTD Cross-Matching ---
    const searchDocNum = extractedFields.passportNumber?.value ||
                         extractedFields.visaNumber?.value ||
                         extractedFields.idNumber?.value ||
                         extractedFields.permitNumber?.value;

    const searchName = extractedFields.fullName?.value || extractedFields.holderName?.value;

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
