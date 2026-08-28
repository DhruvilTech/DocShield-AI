// tests/auth.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';
import { db } from '../src/database/db.js';
import { userRepository } from '../src/repositories/user.repository.js';
import { tokenRepository } from '../src/repositories/token.repository.js';

describe('Authentication & Security API Tests', () => {
  let app;
  let server;
  let baseUrl;

  before(async () => {
    app = createApp();
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api/v1`;
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



  const testEmail = `test.officer.${Date.now()}@docshield.ai`;
  const testPassword = 'Password123!@#';
  let accessToken = '';
  let refreshToken = '';

  test('POST /auth/register - should successfully register a new user', async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Officer',
        email: testEmail,
        password: testPassword,
        role: 'screening_officer',
      }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.user.email, testEmail);
    assert.ok(body.data.tokens.accessToken);
    assert.ok(body.data.tokens.refreshToken);
    assert.ok(body.data.user.roles.includes('screening_officer'));
  });

  test('POST /auth/register - should reject duplicate email registration', async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate Officer',
        email: testEmail,
        password: testPassword,
      }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 409);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'AUTH_EMAIL_EXISTS');
  });

  test('POST /auth/login - should successfully authenticate with valid credentials', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
    assert.ok(body.data.tokens.accessToken);
    assert.ok(body.data.tokens.refreshToken);

    accessToken = body.data.tokens.accessToken;
    refreshToken = body.data.tokens.refreshToken;
  });

  test('POST /auth/login - should reject invalid credentials', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'WrongPassword999!',
      }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 401);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'AUTH_INVALID_CREDENTIALS');
  });

  test('GET /users/me - should return authenticated user profile', async () => {
    const res = await fetch(`${baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.user.email, testEmail);
  });

  test('POST /auth/refresh - should rotate refresh token and issue new pair', async () => {
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
    assert.ok(body.data.tokens.accessToken);
    assert.ok(body.data.tokens.refreshToken);
    assert.notStrictEqual(body.data.tokens.refreshToken, refreshToken);

    refreshToken = body.data.tokens.refreshToken;
  });

  test('POST /auth/logout - should invalidate session and refresh token', async () => {
    const res = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refreshToken }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
  });

  test('GET /health - should report healthy database status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.data.status, 'healthy');
    assert.strictEqual(body.data.database.status, 'connected');
  });
});
