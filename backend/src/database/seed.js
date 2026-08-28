// src/database/seed.js
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { env } from '../config/env.js';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES, AUDIT_ACTIONS } from '../config/constants.js';

const PERMISSIONS_LIST = [
  // User management
  { slug: SYSTEM_PERMISSIONS.USERS_READ, resource: 'users', action: 'read', description: 'View system users' },
  { slug: SYSTEM_PERMISSIONS.USERS_CREATE, resource: 'users', action: 'create', description: 'Create new users' },
  { slug: SYSTEM_PERMISSIONS.USERS_UPDATE, resource: 'users', action: 'update', description: 'Update existing users' },
  { slug: SYSTEM_PERMISSIONS.USERS_DELETE, resource: 'users', action: 'delete', description: 'Deactivate or delete users' },

  // Role & Permissions
  { slug: SYSTEM_PERMISSIONS.ROLES_READ, resource: 'roles', action: 'read', description: 'View system roles' },
  { slug: SYSTEM_PERMISSIONS.ROLES_ASSIGN, resource: 'roles', action: 'assign', description: 'Assign roles to users' },
  { slug: SYSTEM_PERMISSIONS.PERMISSIONS_READ, resource: 'permissions', action: 'read', description: 'View system permissions' },

  // Organizations
  { slug: SYSTEM_PERMISSIONS.ORGANIZATIONS_READ, resource: 'organizations', action: 'read', description: 'View organization details' },
  { slug: SYSTEM_PERMISSIONS.ORGANIZATIONS_CREATE, resource: 'organizations', action: 'create', description: 'Create new organization' },
  { slug: SYSTEM_PERMISSIONS.ORGANIZATIONS_UPDATE, resource: 'organizations', action: 'update', description: 'Update organization metadata' },
  { slug: SYSTEM_PERMISSIONS.ORGANIZATIONS_DELETE, resource: 'organizations', action: 'delete', description: 'Delete organization' },
  { slug: SYSTEM_PERMISSIONS.ORGANIZATIONS_MANAGE_MEMBERS, resource: 'organizations', action: 'manage_members', description: 'Manage organization members and roles' },
  { slug: SYSTEM_PERMISSIONS.ORGANIZATIONS_INVITE, resource: 'organizations', action: 'invite', description: 'Send organization invitations' },

  // Document Management & Screening
  { slug: SYSTEM_PERMISSIONS.DOCUMENTS_READ, resource: 'documents', action: 'read', description: 'View screened documents' },
  { slug: SYSTEM_PERMISSIONS.DOCUMENTS_CREATE, resource: 'documents', action: 'create', description: 'Upload documents for screening' },
  { slug: SYSTEM_PERMISSIONS.DOCUMENTS_UPDATE, resource: 'documents', action: 'update', description: 'Update document metadata' },
  { slug: SYSTEM_PERMISSIONS.DOCUMENTS_DELETE, resource: 'documents', action: 'delete', description: 'Remove documents from vault' },
  { slug: SYSTEM_PERMISSIONS.DOCUMENTS_DOWNLOAD, resource: 'documents', action: 'download', description: 'Download secured documents' },
  { slug: SYSTEM_PERMISSIONS.DOCUMENTS_UPLOAD_VERSION, resource: 'documents', action: 'upload_version', description: 'Upload new document version' },
  { slug: SYSTEM_PERMISSIONS.DOCUMENTS_VIEW_VERSIONS, resource: 'documents', action: 'view_versions', description: 'View document version history' },
  { slug: SYSTEM_PERMISSIONS.DOCUMENTS_ARCHIVE, resource: 'documents', action: 'archive', description: 'Archive documents' },
  { slug: SYSTEM_PERMISSIONS.SCREENING_RUN, resource: 'screening', action: 'run', description: 'Execute AI document screening pipeline' },
  { slug: SYSTEM_PERMISSIONS.SCREENING_READ, resource: 'screening', action: 'read', description: 'View screening analysis and telemetry' },

  // Forensics & Threats
  { slug: SYSTEM_PERMISSIONS.FORENSICS_READ, resource: 'forensics', action: 'read', description: 'View document tampering forensics' },
  { slug: SYSTEM_PERMISSIONS.FORENSICS_ANALYZE, resource: 'forensics', action: 'analyze', description: 'Run deep forensic analysis' },
  { slug: SYSTEM_PERMISSIONS.THREATS_READ, resource: 'threats', action: 'read', description: 'View threat intelligence feed' },
  { slug: SYSTEM_PERMISSIONS.THREATS_MANAGE, resource: 'threats', action: 'manage', description: 'Acknowledge or mitigate threats' },

  // Vault, Reports & Audit
  { slug: SYSTEM_PERMISSIONS.VAULT_READ, resource: 'vault', action: 'read', description: 'Access encrypted document vault' },
  { slug: SYSTEM_PERMISSIONS.VAULT_MANAGE, resource: 'vault', action: 'manage', description: 'Manage vault security policies' },
  { slug: SYSTEM_PERMISSIONS.REPORTS_READ, resource: 'reports', action: 'read', description: 'View compliance and screening reports' },
  { slug: SYSTEM_PERMISSIONS.REPORTS_CREATE, resource: 'reports', action: 'create', description: 'Generate screening audit reports' },
  { slug: SYSTEM_PERMISSIONS.AUDIT_LOGS_READ, resource: 'audit_logs', action: 'read', description: 'Access digital investigation audit logs' },
];

const ROLES_LIST = [
  {
    name: 'Super Admin',
    slug: SYSTEM_ROLES.SUPER_ADMIN,
    description: 'Full unrestricted system administration access',
    is_system: true,
    permissionSlugs: Object.values(SYSTEM_PERMISSIONS),
  },
  {
    name: 'Screening Officer',
    slug: SYSTEM_ROLES.SCREENING_OFFICER,
    description: 'Can upload documents, trigger screening, and manage documents within organization',
    is_system: true,
    permissionSlugs: [
      SYSTEM_PERMISSIONS.DOCUMENTS_READ,
      SYSTEM_PERMISSIONS.DOCUMENTS_CREATE,
      SYSTEM_PERMISSIONS.DOCUMENTS_UPDATE,
      SYSTEM_PERMISSIONS.DOCUMENTS_DOWNLOAD,
      SYSTEM_PERMISSIONS.DOCUMENTS_UPLOAD_VERSION,
      SYSTEM_PERMISSIONS.DOCUMENTS_VIEW_VERSIONS,
      SYSTEM_PERMISSIONS.SCREENING_RUN,
      SYSTEM_PERMISSIONS.SCREENING_READ,
      SYSTEM_PERMISSIONS.ORGANIZATIONS_READ,
      SYSTEM_PERMISSIONS.REPORTS_READ,
      SYSTEM_PERMISSIONS.REPORTS_CREATE,
      SYSTEM_PERMISSIONS.THREATS_READ,
    ],
  },
  {
    name: 'Investigator',
    slug: SYSTEM_ROLES.INVESTIGATOR,
    description: 'Deep forensic investigation, fraud analysis, and digital audit trail access',
    is_system: true,
    permissionSlugs: [
      SYSTEM_PERMISSIONS.DOCUMENTS_READ,
      SYSTEM_PERMISSIONS.DOCUMENTS_DOWNLOAD,
      SYSTEM_PERMISSIONS.DOCUMENTS_VIEW_VERSIONS,
      SYSTEM_PERMISSIONS.SCREENING_READ,
      SYSTEM_PERMISSIONS.FORENSICS_READ,
      SYSTEM_PERMISSIONS.FORENSICS_ANALYZE,
      SYSTEM_PERMISSIONS.THREATS_READ,
      SYSTEM_PERMISSIONS.THREATS_MANAGE,
      SYSTEM_PERMISSIONS.VAULT_READ,
      SYSTEM_PERMISSIONS.REPORTS_READ,
      SYSTEM_PERMISSIONS.REPORTS_CREATE,
      SYSTEM_PERMISSIONS.ORGANIZATIONS_READ,
      SYSTEM_PERMISSIONS.AUDIT_LOGS_READ,
    ],
  },
  {
    name: 'Analyst / Viewer',
    slug: SYSTEM_ROLES.ANALYST_VIEWER,
    description: 'Read-only access to screening reports, metrics, and threat intelligence',
    is_system: true,
    permissionSlugs: [
      SYSTEM_PERMISSIONS.DOCUMENTS_READ,
      SYSTEM_PERMISSIONS.DOCUMENTS_VIEW_VERSIONS,
      SYSTEM_PERMISSIONS.SCREENING_READ,
      SYSTEM_PERMISSIONS.THREATS_READ,
      SYSTEM_PERMISSIONS.REPORTS_READ,
      SYSTEM_PERMISSIONS.ORGANIZATIONS_READ,
    ],
  },
];

export async function seedDatabase() {
  console.log('🌱 [DocShield Seed] Seeding RBAC permissions, roles, and initial users & organizations...');

  // 1. Seed Permissions
  const permissionIdMap = new Map();

  for (const perm of PERMISSIONS_LIST) {
    const existing = await db.queryOne('SELECT id FROM permissions WHERE slug = ?;', [perm.slug]);
    if (!existing) {
      const id = uuidv4();
      await db.execute(
        'INSERT INTO permissions (id, slug, resource, action, description) VALUES (?, ?, ?, ?, ?);',
        [id, perm.slug, perm.resource, perm.action, perm.description]
      );
      permissionIdMap.set(perm.slug, id);
    } else {
      permissionIdMap.set(perm.slug, existing.id);
    }
  }
  console.log(`✅ Seeded ${PERMISSIONS_LIST.length} system permissions.`);

  // 2. Seed Roles and Role Permissions
  const roleIdMap = new Map();

  for (const roleDef of ROLES_LIST) {
    let roleId;
    const existingRole = await db.queryOne('SELECT id FROM roles WHERE slug = ?;', [roleDef.slug]);
    if (!existingRole) {
      roleId = uuidv4();
      await db.execute(
        'INSERT INTO roles (id, name, slug, description, is_system) VALUES (?, ?, ?, ?, ?);',
        [roleId, roleDef.name, roleDef.slug, roleDef.description, roleDef.is_system]
      );
    } else {
      roleId = existingRole.id;
    }
    roleIdMap.set(roleDef.slug, roleId);

    // Associate permissions
    for (const pSlug of roleDef.permissionSlugs) {
      const pId = permissionIdMap.get(pSlug);
      if (pId) {
        await db.execute(
          'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?);',
          [roleId, pId]
        );
      }
    }
  }
  console.log(`✅ Seeded ${ROLES_LIST.length} system roles and role-permission mappings.`);

  // 3. Seed Default Admin User
  const adminEmail = 'admin@docshield.ai';
  let adminId;
  const existingAdmin = await db.queryOne('SELECT id FROM users WHERE email = ?;', [adminEmail]);

  if (!existingAdmin) {
    adminId = uuidv4();
    const salt = await bcrypt.genSalt(env.BCRYPT_SALT_ROUNDS);
    const passwordHash = await bcrypt.hash('AdminPassword123!', salt);

    await db.execute(
      `INSERT INTO users (id, name, email, password_hash, status, email_verified)
       VALUES (?, ?, ?, ?, 'ACTIVE', TRUE);`,
      [adminId, 'Super Administrator', adminEmail, passwordHash]
    );

    const superAdminRoleId = roleIdMap.get(SYSTEM_ROLES.SUPER_ADMIN);
    if (superAdminRoleId) {
      await db.execute(
        'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?);',
        [adminId, superAdminRoleId]
      );
    }

    await db.execute(
      `INSERT INTO audit_logs (id, actor_user_id, action, resource_type, resource_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [
        uuidv4(),
        adminId,
        AUDIT_ACTIONS.USER_CREATED,
        'user',
        adminId,
        JSON.stringify({ role: SYSTEM_ROLES.SUPER_ADMIN, email: adminEmail, initialSeed: true }),
      ]
    );

    console.log(`✅ Seeded Super Admin user: ${adminEmail} (Password: AdminPassword123!)`);
  } else {
    adminId = existingAdmin.id;
    console.log(`⏩ Super Admin user ${adminEmail} already exists.`);
  }

  // 4. Seed Default Screening Officer User
  const officerEmail = 'officer@docshield.ai';
  let officerId;
  const existingOfficer = await db.queryOne('SELECT id FROM users WHERE email = ?;', [officerEmail]);

  if (!existingOfficer) {
    officerId = uuidv4();
    const salt = await bcrypt.genSalt(env.BCRYPT_SALT_ROUNDS);
    const passwordHash = await bcrypt.hash('OfficerPassword123!', salt);

    await db.execute(
      `INSERT INTO users (id, name, email, password_hash, status, email_verified)
       VALUES (?, ?, ?, ?, 'ACTIVE', TRUE);`,
      [officerId, 'Officer Jane Doe', officerEmail, passwordHash]
    );

    const officerRoleId = roleIdMap.get(SYSTEM_ROLES.SCREENING_OFFICER);
    if (officerRoleId) {
      await db.execute(
        'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?);',
        [officerId, officerRoleId]
      );
    }

    console.log(`✅ Seeded Screening Officer user: ${officerEmail} (Password: OfficerPassword123!)`);
  } else {
    officerId = existingOfficer.id;
    console.log(`⏩ Screening Officer user ${officerEmail} already exists.`);
  }

  // 5. Seed Default Organization and Memberships
  const defaultOrgSlug = 'global-security';
  let defaultOrgId;
  const existingOrg = await db.queryOne('SELECT id FROM organizations WHERE slug = ?;', [defaultOrgSlug]);

  if (!existingOrg) {
    defaultOrgId = uuidv4();
    await db.execute(
      `INSERT INTO organizations (id, name, slug, description, status, created_by)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?);`,
      [
        defaultOrgId,
        'DocShield Global Security Operations',
        defaultOrgSlug,
        'Primary security operations center for international document screening and fraud intelligence.',
        adminId,
      ]
    );
    console.log(`✅ Seeded Default Organization: DocShield Global Security Operations (${defaultOrgSlug})`);
  } else {
    defaultOrgId = existingOrg.id;
    console.log(`⏩ Default organization ${defaultOrgSlug} already exists.`);
  }

  // Map Admin to Org
  const superAdminRoleId = roleIdMap.get(SYSTEM_ROLES.SUPER_ADMIN);
  if (adminId && defaultOrgId && superAdminRoleId) {
    const existingMember = await db.queryOne(
      'SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?;',
      [defaultOrgId, adminId]
    );
    if (!existingMember) {
      await db.execute(
        `INSERT INTO organization_members (id, organization_id, user_id, role_id, status)
         VALUES (?, ?, ?, ?, 'ACTIVE');`,
        [uuidv4(), defaultOrgId, adminId, superAdminRoleId]
      );
    }
  }

  // Map Officer to Org
  const officerRoleId = roleIdMap.get(SYSTEM_ROLES.SCREENING_OFFICER);
  if (officerId && defaultOrgId && officerRoleId) {
    const existingMember = await db.queryOne(
      'SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?;',
      [defaultOrgId, officerId]
    );
    if (!existingMember) {
      await db.execute(
        `INSERT INTO organization_members (id, organization_id, user_id, role_id, status)
         VALUES (?, ?, ?, ?, 'ACTIVE');`,
        [uuidv4(), defaultOrgId, officerId, officerRoleId]
      );
    }
  }

  console.log('🎉 [DocShield Seed] Database seeding finished successfully.');
}

// Allow direct execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seedDatabase()
    .then(async () => {
      await db.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Seeding failed:', err);
      await db.close();
      process.exit(1);
    });
}

