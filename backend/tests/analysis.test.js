import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/database/seed.js';
import { db } from '../src/database/db.js';

describe('Phase 6: AI Document Intelligence & Findings API Tests', () => {
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
    const thirdEmail = `test.ai.user.${Date.now()}@docshield.ai`;
    const thirdRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Isolated AI Examiner',
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
        name: `Isolated AI Org B ${Date.now()}`,
      }),
    });
    const otherOrgData = await otherOrgRes.json();
    otherOrgId = otherOrgData.data.organization.id;

    // 4. Upload a mock Visa PDF with deliberate expired date to test anomaly detection
    const visaContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj
4 0 obj << /Length 200 >> stream
BT
/F1 12 Tf
(SCHENGEN VISA) Tj
(Holder: DUPONT JEAN) Tj
(Visa Number: V98765432) Tj
(Visa Type: TOURIST C) Tj
(Entries: MULTIPLE) Tj
(Duration of Stay: 90 DAYS) Tj
(Valid From: 01/01/2020) Tj
(Valid Until: 01/06/2020) Tj
(Passport No: P55667788) Tj
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
    const fileBlob = new Blob([visaContent], { type: 'application/pdf' });
    formData.append('file', fileBlob, 'schengen_visa_dupont.pdf');
    formData.append('name', 'Schengen Visa - Jean Dupont');
    formData.append('documentType', 'VISA');

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

    // Process document first to generate extraction
    await fetch(`${baseUrl}/documents/${createdDocId}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({ jobType: 'FULL_PIPELINE' }),
    });

    // Wait for pipeline execution
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

  test('POST /documents/:id/analysis/run - should run on-demand AI intelligence analysis', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/analysis/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({
        provider: 'heuristic',
      }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.data.analysis.id);
    assert.strictEqual(data.data.analysis.document_id, createdDocId);
    assert.strictEqual(data.data.analysis.status, 'COMPLETED');
    assert.ok(data.data.analysis.confidence > 0.8);
  });

  test('GET /documents/:id/analysis - should retrieve structured intelligence results and findings', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/analysis`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(data.data.analysis);
    assert.ok(Array.isArray(data.data.analysis.findings));
    assert.ok(data.data.analysis.findings.length > 0);

    // Verify expired document anomaly detection
    const expiredFinding = data.data.analysis.findings.find((f) => f.title.includes('Expired'));
    assert.ok(expiredFinding, 'Should detect expired visa date');
    assert.strictEqual(expiredFinding.severity, 'CRITICAL');
    assert.strictEqual(expiredFinding.category, 'VALIDATION');
  });

  test('GET /documents/:id/findings - should list categorized and prioritized security findings', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/findings`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(data.data.findings));
    assert.ok(data.data.findings.length > 0);
    assert.ok(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].includes(data.data.findings[0].severity));
  });

  test('GET /documents/:id/risk-indicators - should retrieve actionable risk indicators', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/risk-indicators`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(data.data.riskIndicators));
    assert.ok(data.data.riskIndicators.length > 0);
    assert.ok(data.data.riskIndicators.some((r) => r.indicator === 'EXPIRED_DOCUMENT'));
  });

  test('Cross-Tenant Security: Org B user cannot access AI analysis of Org A document', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/analysis`, {
      headers: {
        Authorization: `Bearer ${otherUserToken}`,
        'x-organization-id': otherOrgId,
      },
    });

    assert.strictEqual(res.status, 404);
  });

  test('Cross-Tenant Security: Org B user cannot run analysis on Org A document', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/analysis/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${otherUserToken}`,
        'x-organization-id': otherOrgId,
      },
      body: JSON.stringify({ provider: 'heuristic' }),
    });

    assert.strictEqual(res.status, 404);
  });
});
