import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/database/seed.js';
import { db } from '../src/database/db.js';

describe('Phase 7: Biometric Face Verification API Tests', () => {
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
    const thirdEmail = `test.face.user.${Date.now()}@docshield.ai`;
    const thirdRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Isolated Biometric Examiner',
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
        name: `Isolated Biometric Org B ${Date.now()}`,
      }),
    });
    const otherOrgData = await otherOrgRes.json();
    otherOrgId = otherOrgData.data.organization.id;

    // 4. Upload a passport image
    const formData = new FormData();
    const fileBlob = new Blob(['%PDF-1.4 Mock passport with embedded biometric face portrait'], { type: 'application/pdf' });
    formData.append('file', fileBlob, 'passport_portrait.pdf');
    formData.append('name', 'Biometric Passport - Alex Morgan');
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

  test('POST /documents/:id/face-verification - should detect document face and return MATCH', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/face-verification`, {
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
    assert.ok(data.data.faceVerification.id);
    assert.strictEqual(data.data.faceVerification.status, 'MATCH');
    assert.strictEqual(data.data.faceVerification.face_detected_in_doc, true);
    assert.ok(data.data.faceVerification.similarity_score >= 0.75);
  });

  test('POST /documents/:id/face-verification - should correctly record NO_MATCH on subject mismatch', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/face-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({
        referenceFaceBase64: 'data:image/jpeg;base64,mockFaceData',
        simulateMismatch: true,
      }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.data.faceVerification.status, 'NO_MATCH');
    assert.ok(data.data.faceVerification.similarity_score < 0.50);
  });

  test('GET /documents/:id/face-verification - should retrieve latest verification telemetry', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/face-verification`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(data.data.faceVerification);
    assert.strictEqual(data.data.faceVerification.document_id, createdDocId);
    assert.ok(data.data.faceVerification.model_name);
  });

  test('Cross-Tenant Security: Org B user cannot run face verification on Org A document', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/face-verification`, {
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

  test('Cross-Tenant Security: Org B user cannot view face verification of Org A document', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/face-verification`, {
      headers: {
        Authorization: `Bearer ${otherUserToken}`,
        'x-organization-id': otherOrgId,
      },
    });

    assert.strictEqual(res.status, 404);
  });
});
