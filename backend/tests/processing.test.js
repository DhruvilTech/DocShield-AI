import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/database/seed.js';
import { db } from '../src/database/db.js';

describe('Phase 5: Document Processing Pipeline & Extraction Tests', () => {
  let app;
  let server;
  let baseUrl;
  let adminToken;
  let otherUserToken;
  let defaultOrgId;
  let otherOrgId;
  let createdDocId;

  before(async () => {
    await seedDatabase();
    app = createApp();
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;

    // 1. Admin login
    const adminRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@docshield.ai', password: 'AdminPassword123!' }),
    });
    const adminData = await adminRes.json();
    adminToken = adminData.data.tokens.accessToken;

    // 2. Get Default Org ID
    const orgsRes = await fetch(`${baseUrl}/organizations`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const orgsData = await orgsRes.json();
    defaultOrgId = orgsData.data.organizations[0].id;

    // 3. Register isolated user and second organization
    const thirdEmail = `test.processing.user.${Date.now()}@docshield.ai`;
    const thirdRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Isolated Inspector',
        email: thirdEmail,
        password: 'Password123!',
      }),
    });
    const thirdData = await thirdRes.json();
    otherUserToken = thirdData.data.tokens.accessToken;

    const otherOrgRes = await fetch(`${baseUrl}/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${otherUserToken}`,
      },
      body: JSON.stringify({
        name: `Isolated Org B ${Date.now()}`,
      }),
    });
    const otherOrgData = await otherOrgRes.json();
    otherOrgId = otherOrgData.data.organization.id;

    // 4. Upload a mock Passport PDF to default organization
    const passportContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj
4 0 obj << /Length 200 >> stream
BT
/F1 12 Tf
(PASSPORT) Tj
(Surname: SMITH) Tj
(Given Names: JOHN ALEXANDER) Tj
(Passport No: A12345678) Tj
(Nationality: UNITED KINGDOM) Tj
(Date of Birth: 15/04/1988) Tj
(Date of Expiry: 20/10/2029) Tj
(Sex: M) Tj
(P<GBRSMITH<<JOHN<ALEXANDER<<<<<<<<<<<<<<<<<<<) Tj
(A123456780GBR8804154M2910204<<<<<<<<<<<<<<02) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
trailer << /Root 1 0 R >>
startxref
%%EOF`;

    const formData = new FormData();
    const fileBlob = new Blob([passportContent], { type: 'application/pdf' });
    formData.append('file', fileBlob, 'uk_biometric_passport.pdf');
    formData.append('name', 'UK Biometric Passport - John Smith');
    formData.append('documentType', 'PASSPORT');

    const uploadRes = await fetch(`${baseUrl}/documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: formData,
    });

    const uploadData = await uploadRes.json();
    assert.strictEqual(uploadRes.status, 201);
    createdDocId = uploadData.data.document.id;
  });

  after(async () => {
    if (server) {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      await db.close();
    } catch (e) {}
    setTimeout(() => process.exit(0), 50);
  });

  test('POST /documents/:id/process - should queue document processing job (202 Accepted)', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({
        jobType: 'FULL_PIPELINE',
      }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 202);
    assert.strictEqual(data.success, true);
    assert.ok(data.data.job.id);
    assert.strictEqual(data.data.job.document_id, createdDocId);
    assert.ok(['PENDING', 'PROCESSING', 'COMPLETED'].includes(data.data.job.status));
  });

  test('GET /documents/:id/processing-status - should retrieve job telemetry and status', async () => {
    // Wait briefly for background execution
    await new Promise((r) => setTimeout(r, 600));

    const res = await fetch(`${baseUrl}/documents/${createdDocId}/processing-status`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.data.documentId, createdDocId);
    assert.ok(data.data.latestJob);
    assert.ok(['PROCESSING', 'COMPLETED'].includes(data.data.processingStatus));
  });

  test('GET /documents/:id/extraction - should retrieve structured OCR fields and normalized text', async () => {
    // Ensure pipeline is complete
    await new Promise((r) => setTimeout(r, 600));

    const res = await fetch(`${baseUrl}/documents/${createdDocId}/extraction`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(data.data.extraction);
    assert.strictEqual(data.data.extraction.document_id, createdDocId);
    assert.ok(data.data.extraction.confidence_score >= 0.85);

    const fields = data.data.extraction.extracted_fields;
    assert.ok(fields.passportNumber.value);
    assert.strictEqual(fields.passportNumber.value, 'A12345678');
    assert.strictEqual(fields.gender.value, 'M');
    assert.strictEqual(fields.dateOfBirth.value, '1988-04-15');
    assert.strictEqual(fields.dateOfExpiry.value, '2029-10-20');
  });

  test('Cross-Tenant Security: Org B user cannot trigger processing for Org A document', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${otherUserToken}`,
        'x-organization-id': otherOrgId,
      },
      body: JSON.stringify({ jobType: 'FULL_PIPELINE' }),
    });

    assert.strictEqual(res.status, 404);
  });

  test('Cross-Tenant Security: Org B user cannot view extraction of Org A document', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/extraction`, {
      headers: {
        Authorization: `Bearer ${otherUserToken}`,
        'x-organization-id': otherOrgId,
      },
    });

    assert.strictEqual(res.status, 404);
  });

  test('RBAC Enforcement: Missing authentication rejected with 401', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/extraction`);
    assert.strictEqual(res.status, 401);
  });
});
