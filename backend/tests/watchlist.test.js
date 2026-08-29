// tests/watchlist.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/database/seed.js';
import { db } from '../src/database/db.js';

describe('Border Watchlist & Document Validation API Tests', () => {
  let app;
  let server;
  let baseUrl;
  let adminToken;
  let officerToken;
  let defaultOrgId;
  let createdWatchlistId;

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

    // 2. Screening Officer login
    const officerRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'officer@docshield.ai', password: 'OfficerPassword123!' }),
    });
    const officerData = await officerRes.json();
    officerToken = officerData.data.tokens.accessToken;

    // 3. Get Default Org ID from Admin
    const orgsRes = await fetch(`${baseUrl}/organizations`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const orgsData = await orgsRes.json();
    defaultOrgId = orgsData.data.organizations[0].id;
  });

  after(async () => {
    if (server) await new Promise((res) => server.close(res));
    await db.close();
  });

  test('POST /watchlists - should create new border watchlist alert (Super Admin)', async () => {
    const res = await fetch(`${baseUrl}/watchlists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
      body: JSON.stringify({
        documentNumber: 'TST998822',
        fullName: 'Viktor Dragunov',
        nationality: 'RUS',
        reason: 'INTERPOL_RED_NOTICE_FRAUD',
        riskLevel: 'CRITICAL',
        listedBy: 'INTERPOL_SLTD_ALERT',
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.data.document_number, 'TST998822');
    createdWatchlistId = data.data.id;
  });

  test('GET /watchlists - should list active watchlists with search filter', async () => {
    const res = await fetch(`${baseUrl}/watchlists?search=TST998822`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.data.length >= 1);
    assert.equal(data.data[0].document_number, 'TST998822');
  });

  test('DELETE /watchlists/:id - should deactivate watchlist record', async () => {
    const res = await fetch(`${baseUrl}/watchlists/${createdWatchlistId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': defaultOrgId,
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
  });

  test('RBAC: Unauthenticated request should be rejected with 401', async () => {
    const res = await fetch(`${baseUrl}/watchlists`, {
      headers: { 'x-organization-id': defaultOrgId },
    });

    assert.equal(res.status, 401);
  });
});
