import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/database/seed.js';
import { db } from '../src/database/db.js';

describe('Phase 7: Document Tampering & Forensics API Tests', () => {
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
    const thirdEmail = `test.tampering.user.${Date.now()}@docshield.ai`;
    const thirdRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Isolated Forensic Examiner',
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
        name: `Isolated Forensic Org B ${Date.now()}`,
      }),
    });
    const otherOrgData = await otherOrgRes.json();
    otherOrgId = otherOrgData.data.organization.id;

    // 4. Upload a mock altered passport with Photoshop metadata string to test tampering detection
    const tamperedContent = `%PDF-1.4
% Created with Adobe Photoshop CS6
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj
4 0 obj << /Length 250 >> stream
BT
/F1 12 Tf
(PASSPORT) Tj
(Surname: CONNER) Tj
(Given Names: SARAH) Tj
(Passport No: T99887766) Tj
(Nationality: UNITED STATES) Tj
(P<USACONNER<<SARAH<<<<<<<<<<<<<<<<<<<<<<<<<<<<) Tj
(A112233440USA8501015F2812312<<<<<<<<<<<<<<08) Tj
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
    const fileBlob = new Blob([tamperedContent], { type: 'application/pdf' });
    formData.append('file', fileBlob, 'sarah_conner_altered.pdf');
    formData.append('name', 'Sarah Conner - Altered Passport');
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

    // Wait briefly for background execution
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

  test('POST /documents/:id/tampering/analyze - should execute forensic tampering analysis', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/tampering/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.data.analysis.id);
    assert.strictEqual(data.data.analysis.document_id, createdDocId);
    assert.strictEqual(data.data.analysis.status, 'COMPLETED');
    assert.ok(Array.isArray(data.data.analysis.indicators));
  });

  test('GET /documents/:id/tampering - should retrieve forensic score and detected anomalies', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/tampering`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(data.data.analysis);
    assert.strictEqual(data.data.analysis.document_id, createdDocId);

    // Verify detection of Photoshop software metadata or MRZ alteration
    const indicators = data.data.analysis.indicators;
    assert.ok(indicators.length > 0);
    assert.ok(indicators.some((ind) => ind.category === 'METADATA_MISMATCH' || ind.category === 'TEXT_ALTERATION'));
  });

  test('Cross-Tenant Security: Org B user cannot run tampering analysis on Org A document', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/tampering/analyze`, {
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

  test('Cross-Tenant Security: Org B user cannot view tampering results of Org A document', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/tampering`, {
      headers: {
        Authorization: `Bearer ${otherUserToken}`,
        'x-organization-id': otherOrgId,
      },
    });

    assert.strictEqual(res.status, 404);
  });

  test('RBAC: Unauthenticated request rejected with 401', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/tampering`);
    assert.strictEqual(res.status, 401);
  });
});
