import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/database/seed.js';
import { db } from '../src/database/db.js';

describe('Phase 8: Unified Document Screening Intelligence API Tests', () => {
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
    const thirdEmail = `test.screening.user.${Date.now()}@docshield.ai`;
    const thirdRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Isolated Screening Officer',
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
        name: `Isolated Screening Org B ${Date.now()}`,
      }),
    });
    const otherOrgData = await otherOrgRes.json();
    otherOrgId = otherOrgData.data.organization.id;

    // 4. Upload a clean passport document
    const cleanContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj
4 0 obj << /Length 220 >> stream
BT
/F1 12 Tf
(PASSPORT) Tj
(Surname: DOE) Tj
(Given Names: JOHN) Tj
(Passport No: P98765432) Tj
(Nationality: UNITED KINGDOM) Tj
(Date of Expiry: 2032-12-31) Tj
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
    const fileBlob = new Blob([cleanContent], { type: 'application/pdf' });
    formData.append('file', fileBlob, 'john_doe_passport.pdf');
    formData.append('name', 'John Doe - UK Passport');
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

    // Trigger processing pipeline
    await fetch(`${baseUrl}/documents/${createdDocId}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({ jobType: 'FULL_PIPELINE' }),
    });

    await new Promise((r) => setTimeout(r, 600));
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

  test('POST /documents/:id/screening/run - should execute unified screening intelligence', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/screening/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({ forceRerun: true }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.data.screening.id);
    assert.strictEqual(data.data.screening.document_id, createdDocId);
    assert.ok(['PASSED', 'REVIEW_REQUIRED', 'REJECTED'].includes(data.data.screening.verdict));
    assert.ok(Array.isArray(data.data.screening.recommendations));
    assert.ok(Array.isArray(data.data.screening.factors));
  });

  test('GET /documents/:id/screening - should retrieve executive screening intelligence summary', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/screening`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(data.data.screening);
    assert.strictEqual(data.data.screening.document_id, createdDocId);
    assert.ok(typeof data.data.screening.summary === 'string');
    assert.ok(data.data.screening.overall_risk_score !== undefined);
  });

  test('Cross-Tenant Security: Org B cannot run screening on Org A document', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/screening/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${otherUserToken}`,
        'x-organization-id': otherOrgId,
      },
      body: JSON.stringify({}),
    });

    assert.strictEqual(res.status, 404);
  });

  test('Cross-Tenant Security: Org B cannot view screening result of Org A document', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/screening`, {
      headers: {
        Authorization: `Bearer ${otherUserToken}`,
        'x-organization-id': otherOrgId,
      },
    });

    assert.strictEqual(res.status, 404);
  });

  test('RBAC: Unauthenticated screening request rejected with 401', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/screening`);
    assert.strictEqual(res.status, 401);
  });
});
