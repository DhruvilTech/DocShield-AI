import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/database/seed.js';

describe('Phase 4: Document Management & Secure Storage API Tests', () => {
  let app;
  let server;
  let baseUrl;
  let adminToken;
  let officerToken;
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

    // 2. Officer login
    const officerRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'officer@docshield.ai', password: 'OfficerPassword123!' }),
    });
    const officerData = await officerRes.json();
    officerToken = officerData.data.tokens.accessToken;

    // 3. Get Default Org ID
    const orgsRes = await fetch(`${baseUrl}/organizations`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const orgsData = await orgsRes.json();
    defaultOrgId = orgsData.data.organizations[0].id;

    // 4. Register a separate third user and create an isolated second organization
    const thirdEmail = `test.doc.user.${Date.now()}@docshield.ai`;
    const thirdRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Isolated Agent',
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
        name: `Isolated Organization B ${Date.now()}`,
      }),
    });
    const otherOrgData = await otherOrgRes.json();
    otherOrgId = otherOrgData.data.organization.id;
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


  test('POST /documents - should successfully upload a PDF document and create Version 1', async () => {
    const formData = new FormData();
    const fileBlob = new Blob(['%PDF-1.4 Mock document binary content for testing'], { type: 'application/pdf' });
    formData.append('file', fileBlob, 'passport_scan_officer.pdf');
    formData.append('name', 'Diplomatic Passport Scan');
    formData.append('documentType', 'PASSPORT');
    formData.append('description', 'Diplomatic biometric passport for security verification.');

    const res = await fetch(`${baseUrl}/documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: formData,
    });

    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    assert.ok(data.data.document.id);
    assert.strictEqual(data.data.document.name, 'Diplomatic Passport Scan');
    assert.strictEqual(data.data.document.document_type, 'PASSPORT');
    assert.strictEqual(data.data.document.current_version, 1);
    createdDocId = data.data.document.id;
  });

  test('GET /documents - should list organization documents', async () => {
    const res = await fetch(`${baseUrl}/documents?search=Passport`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.length >= 1);
    assert.strictEqual(data.data[0].id, createdDocId);
  });

  test('GET /documents/:id - should retrieve document details with integrity checksum', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.document.id, createdDocId);
    assert.ok(data.data.document.current_checksum);
  });

  test('PATCH /documents/:id - should update document metadata', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({
        description: 'Updated biometric passport description with RFID notes.',
      }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.document.description, 'Updated biometric passport description with RFID notes.');
  });

  test('POST /documents/:id/versions - should upload a new version and increment version number to 2', async () => {
    const formData = new FormData();
    const fileBlob = new Blob(['%PDF-1.4 Version 2 updated scan with ultraviolet overlay'], { type: 'application/pdf' });
    formData.append('file', fileBlob, 'passport_scan_v2.pdf');

    const res = await fetch(`${baseUrl}/documents/${createdDocId}/versions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: formData,
    });

    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.document.current_version, 2);
  });

  test('GET /documents/:id/versions - should list complete version history', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/versions`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.versions.length, 2);
    assert.strictEqual(data.data.versions[0].version_number, 2);
    assert.strictEqual(data.data.versions[1].version_number, 1);
  });

  test('GET /documents/:id/download - should stream the document with safe headers', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/download`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
    const content = await res.text();
    assert.ok(content.includes('Version 2'));
  });

  test('GET /documents/:id/versions/1/download - should stream historical Version 1', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/versions/1/download`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
    const content = await res.text();
    assert.ok(content.includes('Mock document binary content'));
  });

  test('Cross-Tenant Security: User from Org B cannot access Org A document (403/404)', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}`, {
      headers: {
        Authorization: `Bearer ${otherUserToken}`,
        'x-organization-id': otherOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 404);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error.code, 'DOCUMENT_NOT_FOUND');
  });

  test('Rejection of unsupported file extension', async () => {
    const formData = new FormData();
    const maliciousBlob = new Blob(['<script>alert(1)</script>'], { type: 'text/html' });
    formData.append('file', maliciousBlob, 'attack.html');
    formData.append('name', 'Malicious Script');

    const res = await fetch(`${baseUrl}/documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: formData,
    });

    const data = await res.json();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error.code, 'INVALID_FILE_EXTENSION');
  });

  test('DELETE /documents/:id - should soft-delete / archive document', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);

    // Verify it is no longer listed in active documents
    const checkRes = await fetch(`${baseUrl}/documents/${createdDocId}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });
    assert.strictEqual(checkRes.status, 404);
  });
});
