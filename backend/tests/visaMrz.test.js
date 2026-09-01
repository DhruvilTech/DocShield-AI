// backend/tests/visaMrz.test.js
import test from 'node:test';
import assert from 'node:assert';
import { VisaParser } from '../src/services/parsers/visaParser.js';
import { documentValidationService } from '../src/services/validation/documentValidation.service.js';

test('Visa MRZ Parser & Validation Suite', async (t) => {
  await t.test('VisaParser decodes valid MRV-A (44 chars) and verifies 7-3-1 checksums', () => {
    const rawVisaOcr = `
EMBASSY OF INDIA, WASHINGTON DC
VISA / VISA
Visa No: 12345678
Type: Tourist
Entries: Multiple
Duration: 90 Days
Name of Bearer: JOHN DOE
Valid From: 01/01/2020
Valid Until: 01/01/2030
Passport No: A1234567
V<INDDOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
12345678<8USA8501019M3001019A1234567<<<<<<<<
`;
    const fields = VisaParser.parse(rawVisaOcr);

    assert.strictEqual(fields.visaNumber.value, '12345678');
    assert.strictEqual(fields.visaFormat.value, 'MRV_A');
    assert.strictEqual(fields.surname.value, 'DOE');
    assert.strictEqual(fields.givenNames.value, 'JOHN');
    assert.strictEqual(fields.fullName.value, 'JOHN DOE');
    assert.strictEqual(fields.nationality.value, 'USA');
    assert.strictEqual(fields.gender.value, 'M');
    assert.strictEqual(fields.issuingCountry.value, 'IND');
    assert.strictEqual(fields.dateOfBirth.value, '1985-01-01');
    assert.strictEqual(fields.dateOfExpiry.value, '2030-01-01');
    assert.strictEqual(fields.passportNumber.value, 'A1234567');
    assert.strictEqual(fields.mrzLines.value.length, 2);

    assert.strictEqual(fields.mrzValidation.value.isValid, true);
    assert.strictEqual(fields.mrzValidation.value.docNumberCheck.valid, true);
    assert.strictEqual(fields.mrzValidation.value.dobCheck.valid, true);
    assert.strictEqual(fields.mrzValidation.value.expiryCheck.valid, true);
  });

  await t.test('VisaParser decodes valid MRV-B (36 chars) and verifies 7-3-1 checksums', () => {
    const rawVisaOcr = `
CONSULATE GENERAL OF INDIA
VISA
Visa No: V9876543
Type: Business
Entries: Single
Duration: 30 Days
Name of Bearer: JANE DOE
V<INDDOE<<JANE<<<<<<<<<<<<<<<<<<<<<<
V9876543<1GBR9005156F2812313<<<<<<<<
`;
    const fields = VisaParser.parse(rawVisaOcr);

    assert.strictEqual(fields.visaNumber.value, 'V9876543');
    assert.strictEqual(fields.visaFormat.value, 'MRV_B');
    assert.strictEqual(fields.surname.value, 'DOE');
    assert.strictEqual(fields.givenNames.value, 'JANE');
    assert.strictEqual(fields.nationality.value, 'GBR');
    assert.strictEqual(fields.gender.value, 'F');
    assert.strictEqual(fields.mrzValidation.value.isValid, true);
  });

  await t.test('VisaParser detects tampered Visa document number check digit', () => {
    const rawVisaOcr = `
VISA
V<INDDOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
12345678<3USA8501019M3001019A1234567<<<<<<<<
`;
    const fields = VisaParser.parse(rawVisaOcr);

    assert.strictEqual(fields.mrzValidation.value.isValid, false);
    assert.strictEqual(fields.mrzValidation.value.docNumberCheck.valid, false);
    assert.strictEqual(fields.mrzValidation.value.docNumberCheck.expected, '8');
    assert.strictEqual(fields.mrzValidation.value.docNumberCheck.actual, '3');
    assert.ok(fields.mrzValidation.value.errors.length > 0);
  });

  await t.test('DocumentValidationService validates clean Visa MRZ and passes verification', async () => {
    const rawVisaOcr = `
EMBASSY OF INDIA, WASHINGTON DC
VISA / VISA
Visa No: 12345678
Type: Tourist
Entries: Multiple
Duration: 90 Days
Name of Bearer: JOHN DOE
Valid From: 01/01/2020
Valid Until: 01/01/2030
V<INDDOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
12345678<8USA8501019M3001019A1234567<<<<<<<<
`;
    const parsed = VisaParser.parse(rawVisaOcr);
    const result = await documentValidationService.validateDocument(parsed, 'VISA');

    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.checks.mrzCheck.status, 'PASSED');
    assert.strictEqual(result.checks.crossFieldConsistency.status, 'CONSISTENT');
  });

  await t.test('DocumentValidationService flags checksum failure when Visa MRZ check digit is forged', async () => {
    const rawVisaOcr = `
VISA
Visa No: 12345678
Type: Tourist
Entries: Multiple
Duration: 90 Days
Name of Bearer: JOHN DOE
Valid Until: 01/01/2030
V<INDDOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
12345678<5USA8501019M3001019A1234567<<<<<<<<
`;
    const parsed = VisaParser.parse(rawVisaOcr);
    const result = await documentValidationService.validateDocument(parsed, 'VISA');

    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.checks.mrzCheck.status, 'FAILED');
    assert.ok(result.findings.some((f) => f.rule === 'ICAO_9303_CHECKSUM_FAILURE'));
  });

  await t.test('DocumentValidationService detects Visual vs MRZ Visa number mismatch', async () => {
    const rawVisaOcr = `
VISA
Visa No: 88888888
Type: Tourist
Entries: Multiple
Duration: 90 Days
Name of Bearer: JOHN DOE
Valid Until: 01/01/2030
V<INDDOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
12345678<8USA8501019M3001019A1234567<<<<<<<<
`;
    const parsed = VisaParser.parse(rawVisaOcr);
    // Explicit visual mismatch simulation
    parsed.visualVisaNumber = { value: '88888888', confidence: 0.95 };
    parsed.visaNumber = { value: '12345678', confidence: 0.98 };

    const result = await documentValidationService.validateDocument(parsed, 'VISA');

    assert.strictEqual(result.isValid, false);
    assert.ok(result.findings.some((f) => f.rule === 'VISUAL_MRZ_NUMBER_MISMATCH'));
    assert.strictEqual(result.checks.crossFieldConsistency.status, 'MISMATCH');
  });
});
