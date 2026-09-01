import { test, describe } from 'node:test';
import assert from 'node:assert';
import { PassportParser } from '../src/services/parsers/passportParser.js';
import { DocumentValidationService } from '../src/services/validation/documentValidation.service.js';

describe('Indian Passport Parser & Validation (Old and New Formats)', () => {
  const validationService = new DocumentValidationService();

  test('New Format Indian Passport MRZ Parsing (Image 1)', () => {
    const text = `
P<INDPATHAK<<PARTH<<<<<<<<<<<<<<<<<<<<<<<<<<<
AT983807<0IND0608266M36062963067652860226<36
    `.trim();

    const fields = PassportParser.parse(text);

    assert.strictEqual(fields.passportNumber.value, 'AT983807');
    assert.ok(fields.nationality.value === 'INDIAN' || fields.nationality.value === 'IND');
    assert.strictEqual(fields.gender.value, 'M');
    assert.strictEqual(fields.dateOfBirth.value, '2006-08-26');
    assert.strictEqual(fields.dateOfExpiry.value, '2036-06-29');
    assert.ok(fields.fullName.value.includes('PATHAK') && fields.fullName.value.includes('PARTH'));
    assert.strictEqual(fields.surname.value, 'PATHAK');
    assert.strictEqual(fields.givenNames.value, 'PARTH');
    assert.strictEqual(fields.personalNumber.value, '3067652860226');
    assert.strictEqual(fields.mrzValidation.value.isValid, true);
    assert.strictEqual(fields.mrzValidation.value.docNumberCheck.valid, true);
    assert.strictEqual(fields.mrzValidation.value.dobCheck.valid, true);
    assert.strictEqual(fields.mrzValidation.value.expiryCheck.valid, true);
  });

  test('Old Format Indian Passport MRZ Parsing (Image 2)', () => {
    const text = `
P<INDPATHAK<<MAULIKKUMAR<ARUNKUMAR<<<<<<<<<<<
E7251023<2IND8101246M13111303<<<<<<<<<<<<<<2
    `.trim();

    const fields = PassportParser.parse(text);

    assert.strictEqual(fields.passportNumber.value, 'E7251023');
    assert.ok(fields.nationality.value === 'INDIAN' || fields.nationality.value === 'IND');
    assert.strictEqual(fields.gender.value, 'M');
    assert.strictEqual(fields.dateOfBirth.value, '1981-01-24');
    assert.strictEqual(fields.dateOfExpiry.value, '2013-11-13');
    assert.ok(fields.fullName.value.includes('MAULIKKUMAR') && fields.fullName.value.includes('PATHAK'));
    assert.strictEqual(fields.surname.value, 'PATHAK');
    assert.strictEqual(fields.givenNames.value, 'MAULIKKUMAR ARUNKUMAR');
    assert.strictEqual(fields.mrzValidation.value.isValid, true);
    assert.strictEqual(fields.mrzValidation.value.docNumberCheck.valid, true);
    assert.strictEqual(fields.mrzValidation.value.dobCheck.valid, true);
    assert.strictEqual(fields.mrzValidation.value.expiryCheck.valid, true);
  });

  test('New Format Indian Passport Visual Inspection Zone Layout', () => {
    const text = `
type: P  Code: IND  Nationality: INDIAN  Passport No.: AT983807
Surname: PATHAK
Given Name: PARTH
Date of Birth: 26/08/2006  Sex: M
Place of Birth: AHMEDABAD
Place of Issue: AHMEDABAD
Date of Issue: 30/06/2026
Date of Expiry: 29/06/2036
P<INDPATHAK<<PARTH<<<<<<<<<<<<<<<<<<<<<<<<<<<
AT983807<0IND0608266M36062963067652860226<36
    `.trim();

    const fields = PassportParser.parse(text);
    assert.strictEqual(fields.passportNumber.value, 'AT983807');
    assert.ok(fields.nationality.value === 'INDIAN' || fields.nationality.value === 'IND');
    assert.strictEqual(fields.dateOfBirth.value, '2006-08-26');
    assert.strictEqual(fields.dateOfExpiry.value, '2036-06-29');
    assert.strictEqual(fields.gender.value, 'M');
  });

  test('Old Format Indian Passport Visual Inspection Zone Layout', () => {
    const text = `
type: P  Country Code: IND  Passport No.: E7251023
Surname: PATHAK
Given Name: MAULIKKUMAR ARUNKUMAR
Nationality: INDIAN  Sex: M  Date of Birth: 24/01/1981
Place of Birth: AHMEDABAD
Place of issue: AHMEDABAD
Date of Issue: 14/11/2003  Date of Expiry: 13/11/2013
P<INDPATHAK<<MAULIKKUMAR<ARUNKUMAR<<<<<<<<<<<
E7251023<2IND8101246M13111303<<<<<<<<<<<<<<2
    `.trim();

    const fields = PassportParser.parse(text);
    assert.strictEqual(fields.passportNumber.value, 'E7251023');
    assert.ok(fields.nationality.value === 'INDIAN' || fields.nationality.value === 'IND');
    assert.strictEqual(fields.dateOfBirth.value, '1981-01-24');
    assert.strictEqual(fields.dateOfExpiry.value, '2013-11-13');
    assert.strictEqual(fields.gender.value, 'M');
  });

  test('DocumentValidationService validates New Format Indian Passport without false mismatch', async () => {
    const extractedFields = {
      passport_number: { value: 'AT983807' },
      name: { value: 'PATHAK PARTH' },
      nationality: { value: 'IND' },
      date_of_birth: { value: '2006-08-26' },
      date_of_expiry: { value: '2036-06-29' },
      gender: { value: 'M' },
      visual_passport_number: { value: 'AT983807' },
      visual_name: { value: 'PARTH PATHAK' },
      visual_nationality: { value: 'INDIAN' },
      visual_date_of_birth: { value: '26/08/2006' },
      visual_date_of_expiry: { value: '29/06/2036' },
      visual_gender: { value: 'M' },
      mrzLines: {
        value: [
          'P<INDPATHAK<<PARTH<<<<<<<<<<<<<<<<<<<<<<<<<<<',
          'AT983807<0IND0608266M36062963067652860226<36',
        ],
      },
    };

    const result = await validationService.validateDocument(extractedFields, 'PASSPORT');
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.checks.crossFieldConsistency.status, 'CONSISTENT');
    assert.strictEqual(result.checks.mrzCheck.status, 'PASSED');
  });

  test('DocumentValidationService validates Old Format Indian Passport without false mismatch', async () => {
    const extractedFields = {
      passport_number: { value: 'E7251023' },
      name: { value: 'PATHAK MAULIKKUMAR ARUNKUMAR' },
      nationality: { value: 'IND' },
      date_of_birth: { value: '1981-01-24' },
      date_of_expiry: { value: '2030-11-13' }, // future date for active passport test
      gender: { value: 'M' },
      visual_passport_number: { value: 'E7251023' },
      visual_name: { value: 'MAULIKKUMAR ARUNKUMAR PATHAK' },
      visual_nationality: { value: 'INDIAN' },
      visual_date_of_birth: { value: '24/01/1981' },
      visual_date_of_expiry: { value: '13/11/2030' },
      visual_gender: { value: 'M' },
      mrzLines: {
        value: [
          'P<INDPATHAK<<MAULIKKUMAR<ARUNKUMAR<<<<<<<<<<<',
          'E7251023<2IND8101246M30111353<<<<<<<<<<<<<<2',
        ],
      },
    };

    const result = await validationService.validateDocument(extractedFields, 'PASSPORT');
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.checks.crossFieldConsistency.status, 'CONSISTENT');
  });
});
