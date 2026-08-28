// tests/organization.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/database/seed.js';

describe('Phase 3: Organization & Membership API Tests', () => {
  let app;
  let server;
  let baseUrl;
  let adminToken;
  let officerToken;
  let otherToken;
  let otherUserId;
  let createdOrgId;
  let orgName;
  let invitationToken;

  before(async () => {
    await seedDatabase();
    app = createApp();
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;

    // 1. Login as Super Admin
    const adminRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@docshield.ai', password: 'AdminPassword123!' }),
    });
    const adminData = await adminRes.json();
    adminToken = adminData.data.tokens.accessToken;

    // 2. Login as Screening Officer
    const officerRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'officer@docshield.ai', password: 'OfficerPassword123!' }),
    });
    const officerData = await officerRes.json();
    officerToken = officerData.data.tokens.accessToken;

    // 3. Register a third independent user
    const otherEmail = `test.org.user.${Date.now()}@docshield.ai`;
    const otherRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Third Party User',
        email: otherEmail,
        password: 'Password123!',
      }),
    });
    const otherData = await otherRes.json();
    otherToken = otherData.data.tokens.accessToken;
    otherUserId = otherData.data.user.id;
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


  test('POST /organizations - should create a new organization and assign creator as admin', async () => {
    orgName = `Alpha Taskforce ${Date.now()}`;
    const res = await fetch(`${baseUrl}/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: orgName,
        description: 'Dedicated border screening and biometric verification taskforce.',
      }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    assert.ok(data.data.organization.id);
    assert.strictEqual(data.data.organization.name, orgName);
    createdOrgId = data.data.organization.id;
  });

  test('GET /organizations - should list organizations the user belongs to', async () => {
    const res = await fetch(`${baseUrl}/organizations`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.organizations));
    assert.ok(data.data.organizations.length >= 1);
  });

  test('GET /organizations/:id - should retrieve organization details', async () => {
    const res = await fetch(`${baseUrl}/organizations/${createdOrgId}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': createdOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.organization.id, createdOrgId);
  });

  test('PATCH /organizations/:id - should update organization metadata', async () => {
    const res = await fetch(`${baseUrl}/organizations/${createdOrgId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': createdOrgId,
      },
      body: JSON.stringify({
        description: 'Updated operational description for border control.',
      }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.organization.description, 'Updated operational description for border control.');
  });

  test('GET /organizations/:id/members - should list organization members', async () => {
    const res = await fetch(`${baseUrl}/organizations/${createdOrgId}/members`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': createdOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.members));
    assert.ok(data.data.members.length >= 1);
  });

  test('POST /organizations/:id/invitations - should create an invitation token for a new member', async () => {
    const inviteEmail = `invitee.${Date.now()}@docshield.ai`;
    const rolesRes = await fetch(`${baseUrl}/roles`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const rolesData = await rolesRes.json();
    const officerRoleId = rolesData.data.roles.find((r) => r.slug === 'screening_officer').id;

    const res = await fetch(`${baseUrl}/organizations/${createdOrgId}/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-organization-id': createdOrgId,
      },
      body: JSON.stringify({
        email: inviteEmail,
        roleId: officerRoleId,
      }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    assert.ok(data.data.rawToken);
    invitationToken = data.data.rawToken;
  });

  test('GET /invitations/:token - should retrieve public invitation details', async () => {
    const res = await fetch(`${baseUrl}/invitations/${invitationToken}`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.invitation.organization_name, orgName);
  });

  test('POST /invitations/:token/accept - should accept invitation and add user as organization member', async () => {
    const res = await fetch(`${baseUrl}/invitations/${invitationToken}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherToken}` },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.member.organization_id, createdOrgId);
  });

  test('Cross-Organization Security Isolation - non-member user should be rejected with 403', async () => {
    // Create a new separate organization with otherToken
    const newOrgRes = await fetch(`${baseUrl}/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${otherToken}`,
      },
      body: JSON.stringify({
        name: `Isolated Private Taskforce ${Date.now()}`,
      }),
    });
    const newOrgData = await newOrgRes.json();
    const isolatedOrgId = newOrgData.data.organization.id;

    // officerToken (Screening Officer, not super_admin) attempts to access isolatedOrgId
    const res = await fetch(`${baseUrl}/organizations/${isolatedOrgId}/members`, {
      headers: {
        Authorization: `Bearer ${officerToken}`,
        'x-organization-id': isolatedOrgId,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 403);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error.code, 'NOT_ORGANIZATION_MEMBER');
  });
});
