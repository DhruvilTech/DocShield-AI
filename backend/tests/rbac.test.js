// tests/rbac.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';
import { db } from '../src/database/db.js';

describe('RBAC & Authorization API Tests', () => {
  let app;
  let server;
  let baseUrl;
  let adminToken = '';
  let officerToken = '';

  before(async () => {
    app = createApp();
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api/v1`;

    // Login as Super Admin
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@docshield.ai',
        password: 'AdminPassword123!',
      }),
    });
    const adminData = await adminLoginRes.json();
    adminToken = adminData.data.tokens.accessToken;

    // Login as Screening Officer
    const officerLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'officer@docshield.ai',
        password: 'OfficerPassword123!',
      }),
    });
    const officerData = await officerLoginRes.json();
    officerToken = officerData.data.tokens.accessToken;
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



  test('Super Admin - should access user management list (GET /users)', async () => {
    const res = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
  });

  test('Screening Officer - should be FORBIDDEN from accessing user management list (GET /users)', async () => {
    const res = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: `Bearer ${officerToken}` },
    });
    const body = await res.json();
    assert.strictEqual(res.status, 403);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'FORBIDDEN_PERMISSION_DENIED');
  });

  test('Unauthenticated user - should be rejected with 401 on protected endpoint', async () => {
    const res = await fetch(`${baseUrl}/users`);
    const body = await res.json();
    assert.strictEqual(res.status, 401);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'AUTH_TOKEN_MISSING');
  });

  test('Super Admin - should view system audit logs (GET /audit-logs)', async () => {
    const res = await fetch(`${baseUrl}/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
  });

  test('Super Admin - should view list of roles (GET /roles)', async () => {
    const res = await fetch(`${baseUrl}/roles`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
    assert.ok(body.data.roles.length >= 4);
  });
});
