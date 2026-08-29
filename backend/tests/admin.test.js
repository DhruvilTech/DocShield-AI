// tests/admin.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';
import { db } from '../src/database/db.js';

describe('Super Admin Mission Command & Telemetry API Tests', () => {
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

    // Login as Normal Screening Officer
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

  test('1. GET /admin/telemetry - Super Admin should receive hardware enclave and OS telemetry', async () => {
    const res = await fetch(`${baseUrl}/admin/telemetry`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.data.system.cpu.cores >= 1);
    assert.ok(data.data.system.memory.totalMB > 0);
    assert.strictEqual(data.data.enclave.teeStatus, 'ACTIVE_HARDWARE_ISOLATED');
    assert.ok(data.data.aiClusters.length >= 4);
    assert.ok(typeof data.data.metrics.totalOrganizations === 'number');
  });

  test('2. GET /admin/telemetry - Normal Officer should be FORBIDDEN (403)', async () => {
    const res = await fetch(`${baseUrl}/admin/telemetry`, {
      headers: { Authorization: `Bearer ${officerToken}` },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 403);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error.code, 'FORBIDDEN_SUPER_ADMIN_REQUIRED');
  });

  test('3. GET /admin/telemetry - Unauthenticated request should be rejected (401)', async () => {
    const res = await fetch(`${baseUrl}/admin/telemetry`);
    assert.strictEqual(res.status, 401);
  });

  test('4. GET /admin/overview - Super Admin should retrieve recent security overview', async () => {
    const res = await fetch(`${baseUrl}/admin/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.recentScreenings));
    assert.ok(Array.isArray(data.data.recentAudits));
    assert.ok(Array.isArray(data.data.topWatchlists));
  });
});
