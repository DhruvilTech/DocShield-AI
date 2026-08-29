import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/database/seed.js';
import { db } from '../src/database/db.js';

describe('Phase 6: Biometric Face Verification & Liveness End-to-End Tests', () => {
  let app;
  let server;
  let baseUrl;
  let adminToken;
  let otherUserToken;
  let defaultOrgId;
  let otherOrgId;
  let createdDocId;
  let genuineLiveBase64;

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

    // 4. Upload a passport image using sample_faces/person_a_doc.jpg
    const docPath = path.resolve(process.cwd(), '../sample_faces/person_a_doc.jpg');
    const livePath = path.resolve(process.cwd(), '../sample_faces/person_a_live.jpg');
    
    let docBuffer = Buffer.from('%PDF-1.4 Mock passport');
    try {
      docBuffer = fs.readFileSync(docPath);
    } catch {}

    try {
      genuineLiveBase64 = `data:image/jpeg;base64,${fs.readFileSync(livePath).toString('base64')}`;
    } catch {
      genuineLiveBase64 = 'data:image/jpeg;base64,mockGenuineSelfieData';
    }

    const formData = new FormData();
    const fileBlob = new Blob([docBuffer], { type: 'image/jpeg' });
    formData.append('file', fileBlob, 'person_a_doc.jpg');
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

  test('1. Same Person / Genuine Subject -> MATCH with Liveness PASS', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/face-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({
        referenceFaceBase64: genuineLiveBase64,
      }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.data.faceVerification.id);
    assert.strictEqual(data.data.faceVerification.status, 'MATCH');
    assert.strictEqual(data.data.faceVerification.face_detected_in_doc, true);
    assert.ok(data.data.faceVerification.similarity_score >= 0.70);
    assert.strictEqual(data.data.faceVerification.metadata.liveness.status, 'PASS');
  });

  test('2. Different Person / Imposter Subject -> NO_MATCH / MISMATCH', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/face-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({
        referenceFaceBase64: 'data:image/jpeg;base64,mockImposterData',
        simulateMismatch: true,
      }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.data.faceVerification.status, 'NO_MATCH');
    assert.ok(data.data.faceVerification.similarity_score < 0.45);
  });

  test('3. No Face Detected -> NO_FACE_DETECTED', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/face-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({
        simulateNoFace: true,
      }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.data.faceVerification.status, 'NO_FACE_DETECTED');
    assert.strictEqual(data.data.faceVerification.face_detected_in_doc, false);
    assert.strictEqual(data.data.faceVerification.similarity_score, 0);
  });

  test('4. Multiple Faces in Scene -> INCONCLUSIVE with MULTIPLE_FACES_DETECTED', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/face-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({
        referenceFaceBase64: 'data:image/jpeg;base64,mockCrowdedData',
        simulateMultipleFaces: true,
      }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.data.faceVerification.status, 'INCONCLUSIVE');
    assert.strictEqual(data.data.faceVerification.metadata.face_count.live, 2);
    assert.strictEqual(data.data.faceVerification.metadata.rejectionError.code, 'MULTIPLE_FACES_DETECTED');
  });

  test('5. Poor Quality / Blurry Image -> INCONCLUSIVE with POOR_IMAGE_QUALITY', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/face-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({
        referenceFaceBase64: 'data:image/jpeg;base64,mockBlurryData',
        simulatePoorQuality: true,
      }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.data.faceVerification.status, 'INCONCLUSIVE');
    assert.strictEqual(data.data.faceVerification.metadata.rejectionError.code, 'POOR_IMAGE_QUALITY');
  });

  test('6. Active Liveness Failure -> Verification Rejected with Liveness FAIL', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/face-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({
        referenceFaceBase64: 'data:image/jpeg;base64,mockSpoofData',
        simulateLivenessFail: true,
      }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.data.faceVerification.status, 'NO_MATCH');
    assert.strictEqual(data.data.faceVerification.metadata.liveness.status, 'FAIL');
    assert.ok(data.data.faceVerification.metadata.rejectionReason.includes('Liveness challenge'));
  });

  test('7. Multi-Factor Risk Scoring includes Biometric & Liveness Failure signals', async () => {
    const riskRes = await fetch(`${baseUrl}/documents/${createdDocId}/risk/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({}),
    });

    const riskData = await riskRes.json();
    assert.strictEqual(riskRes.status, 200);
    assert.strictEqual(riskData.success, true);
    assert.strictEqual(riskData.data.riskScore.score_breakdown.biometricScore, 20);
    assert.ok(riskData.data.riskScore.explanation.includes('Active biometric liveness challenge failed'));
  });

  test('8. GET /documents/:id/face-verification - should retrieve latest verification telemetry', async () => {
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
    assert.ok(data.data.faceVerification.metadata.liveness);
  });

  test('9. Cross-Tenant Security: Org B user cannot run face verification on Org A document', async () => {
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

  test('10. Cross-Tenant Security: Org B user cannot view face verification of Org A document', async () => {
    const res = await fetch(`${baseUrl}/documents/${createdDocId}/face-verification`, {
      headers: {
        Authorization: `Bearer ${otherUserToken}`,
        'x-organization-id': otherOrgId,
      },
    });

    assert.strictEqual(res.status, 404);
  });
});
