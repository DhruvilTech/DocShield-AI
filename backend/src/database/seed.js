// src/database/seed.js
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { env } from '../config/env.js';
import { AUDIT_ACTIONS } from '../config/constants.js';

const PERMISSIONS_LIST = [
  // User management
  { slug: 'users:read', resource: 'users', action: 'read', description: 'View system users' },
  { slug: 'users:create', resource: 'users', action: 'create', description: 'Create new users' },
  { slug: 'users:update', resource: 'users', action: 'update', description: 'Update existing users' },
  { slug: 'users:delete', resource: 'users', action: 'delete', description: 'Deactivate or delete users' },

  // Role & Permissions
  { slug: 'roles:read', resource: 'roles', action: 'read', description: 'View system roles' },
  { slug: 'roles:assign', resource: 'roles', action: 'assign', description: 'Assign roles to users' },
  { slug: 'permissions:read', resource: 'permissions', action: 'read', description: 'View system permissions' },

  // Organizations
  { slug: 'organizations:read', resource: 'organizations', action: 'read', description: 'View organization details' },
  { slug: 'organizations:create', resource: 'organizations', action: 'create', description: 'Create new organization' },
  { slug: 'organizations:update', resource: 'organizations', action: 'update', description: 'Update organization metadata' },
  { slug: 'organizations:delete', resource: 'organizations', action: 'delete', description: 'Delete organization' },
  { slug: 'organizations:manage_members', resource: 'organizations', action: 'manage_members', description: 'Manage organization members and roles' },
  { slug: 'organizations:invite', resource: 'organizations', action: 'invite', description: 'Send organization invitations' },

  // Document Management, Processing & Screening
  { slug: 'documents:read', resource: 'documents', action: 'read', description: 'View screened documents' },
  { slug: 'documents:create', resource: 'documents', action: 'create', description: 'Upload documents for screening' },
  { slug: 'documents:update', resource: 'documents', action: 'update', description: 'Update document metadata' },
  { slug: 'documents:delete', resource: 'documents', action: 'delete', description: 'Remove documents from vault' },
  { slug: 'documents:download', resource: 'documents', action: 'download', description: 'Download secured documents' },
  { slug: 'documents:upload_version', resource: 'documents', action: 'upload_version', description: 'Upload new document version' },
  { slug: 'documents:view_versions', resource: 'documents', action: 'view_versions', description: 'View document version history' },
  { slug: 'documents:archive', resource: 'documents', action: 'archive', description: 'Archive documents' },
  { slug: 'documents:process', resource: 'documents', action: 'process', description: 'Trigger document processing pipeline' },
  { slug: 'documents:view_extraction', resource: 'documents', action: 'view_extraction', description: 'View extracted text and structured OCR fields' },
  { slug: 'screening:run', resource: 'screening', action: 'run', description: 'Execute AI document screening pipeline' },
  { slug: 'screening:read', resource: 'screening', action: 'read', description: 'View screening analysis and telemetry' },

  // AI & Document Intelligence
  { slug: 'analysis:read', resource: 'analysis', action: 'read', description: 'View AI document intelligence analyses and risk indicators' },
  { slug: 'analysis:run', resource: 'analysis', action: 'run', description: 'Execute AI document intelligence analysis' },
  { slug: 'findings:read', resource: 'findings', action: 'read', description: 'View security findings and anomalies' },

  // Phase 7: Tampering & Face Verification
  { slug: 'tampering:run', resource: 'tampering', action: 'run', description: 'Run tampering and forensic analysis' },
  { slug: 'tampering:read', resource: 'tampering', action: 'read', description: 'View document tampering forensics' },
  { slug: 'face_verification:run', resource: 'face_verification', action: 'run', description: 'Run biometric face detection and verification' },
  { slug: 'face_verification:read', resource: 'face_verification', action: 'read', description: 'View face verification comparisons and similarity' },

  // Phase 8: Risk Scoring & Screening Intelligence
  { slug: 'risk:run', resource: 'risk', action: 'run', description: 'Calculate multi-factor document risk scores' },
  { slug: 'risk:read', resource: 'risk', action: 'read', description: 'View document risk assessments and score breakdowns' },

  // Forensics & Threats
  { slug: 'forensics:read', resource: 'forensics', action: 'read', description: 'View document tampering forensics' },
  { slug: 'forensics:analyze', resource: 'forensics', action: 'analyze', description: 'Run deep forensic analysis' },
  { slug: 'threats:read', resource: 'threats', action: 'read', description: 'View threat intelligence feed' },
  { slug: 'threats:manage', resource: 'threats', action: 'manage', description: 'Acknowledge or mitigate threats' },

  // Watchlist Management
  { slug: 'watchlist:read', resource: 'watchlist', action: 'read', description: 'View travel document watchlists' },
  { slug: 'watchlist:create', resource: 'watchlist', action: 'create', description: 'Add travel document to watchlist' },
  { slug: 'watchlist:delete', resource: 'watchlist', action: 'delete', description: 'Remove travel document from watchlist' },

  // Vault, Reports & Audit
  { slug: 'vault:read', resource: 'vault', action: 'read', description: 'Access encrypted document vault' },
  { slug: 'vault:manage', resource: 'vault', action: 'manage', description: 'Manage vault security policies' },
  { slug: 'reports:read', resource: 'reports', action: 'read', description: 'View compliance and screening reports' },
  { slug: 'reports:create', resource: 'reports', action: 'create', description: 'Generate screening audit reports' },
  { slug: 'audit_logs:read', resource: 'audit_logs', action: 'read', description: 'Access digital investigation audit logs' },
];

const ROLES_LIST = [
  {
    name: 'Super Admin',
    slug: 'super_admin',
    description: 'Full unrestricted system administration access',
    is_system: true,
    permissionSlugs: PERMISSIONS_LIST.map((p) => p.slug),
  },
  {
    name: 'Screening Officer',
    slug: 'screening_officer',
    description: 'Can upload documents, trigger screening, and manage documents within organization',
    is_system: true,
    permissionSlugs: [
      'documents:read',
      'documents:create',
      'documents:update',
      'documents:download',
      'documents:upload_version',
      'documents:view_versions',
      'documents:process',
      'documents:view_extraction',
      'screening:run',
      'screening:read',
      'analysis:read',
      'analysis:run',
      'findings:read',
      'tampering:run',
      'tampering:read',
      'face_verification:run',
      'face_verification:read',
      'risk:run',
      'risk:read',
      'watchlist:read',
      'watchlist:create',
      'organizations:read',
      'reports:read',
      'reports:create',
      'threats:read',
    ],
  },
];

const INITIAL_WATCHLIST_RECORDS = [
  {
    documentNumber: 'E88920194',
    fullName: 'Alexander Rostov',
    nationality: 'RUS',
    reason: 'INTERPOL_RED_NOTICE_FRAUD',
    riskLevel: 'CRITICAL',
    listedBy: 'INTERPOL_SLTD',
    metadata: { alertType: 'Stolen Blank Passport & Financial Fraud', noticeId: 'RN-2026-0812' },
  },
  {
    documentNumber: 'P12398471',
    fullName: 'Carlos Mendoza',
    nationality: 'MEX',
    reason: 'STOLEN_PASSPORT_ALERT',
    riskLevel: 'CRITICAL',
    listedBy: 'BORDER_SECURITY_DIRECTIVE',
    metadata: { alertType: 'Reported Stolen at Transit Airport', reportedDate: '2026-01-15' },
  },
  {
    documentNumber: 'V9842109',
    fullName: 'Elena Petrova',
    nationality: 'UKR',
    reason: 'REVOKED_VISA_TAMPER_ALERT',
    riskLevel: 'HIGH',
    listedBy: 'IMMIGRATION_ENFORCEMENT',
    metadata: { alertType: 'Forged Consular Stamp & Modified Stay Limit', noticeId: 'VI-984-2' },
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

  // Clean up legacy dummy account if present
  const oldLegacyAdmin = await db.queryOne('SELECT id FROM users WHERE email = ?;', ['admin123@gmail.com']);
  if (oldLegacyAdmin) {
    await db.execute('DELETE FROM users WHERE email = ?;', ['admin123@gmail.com']);
    console.log('🗑️ Cleaned up legacy admin123@gmail.com account.');
  }

  // 3. Seed Fixed Admin User (demo@gmail.com / Demo@123)
  const fixedAdminEmail = 'demo@gmail.com';
  let fixedAdminId;
  const existingFixedAdmin = await db.queryOne('SELECT id FROM users WHERE email = ?;', [fixedAdminEmail]);

  if (!existingFixedAdmin) {
    fixedAdminId = uuidv4();
    const salt = await bcrypt.genSalt(env.BCRYPT_SALT_ROUNDS);
    const passwordHash = await bcrypt.hash('Demo@123', salt);

    await db.execute(
      `INSERT INTO users (id, name, email, password_hash, status, email_verified)
       VALUES (?, ?, ?, ?, 'ACTIVE', TRUE);`,
      [fixedAdminId, 'Border Control Administrator', fixedAdminEmail, passwordHash]
    );

    const superAdminRoleId = roleIdMap.get('super_admin');
    if (superAdminRoleId) {
      await db.execute(
        'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?);',
        [fixedAdminId, superAdminRoleId]
      );
    }

    console.log(`✅ Seeded Fixed Admin user: ${fixedAdminEmail} (Password: Demo@123)`);
  } else {
    fixedAdminId = existingFixedAdmin.id;
    // Ensure password is synchronized to Demo@123
    const salt = await bcrypt.genSalt(env.BCRYPT_SALT_ROUNDS);
    const passwordHash = await bcrypt.hash('Demo@123', salt);
    await db.execute('UPDATE users SET password_hash = ?, status = "ACTIVE", email_verified = TRUE WHERE id = ?;', [passwordHash, fixedAdminId]);
    console.log(`⏩ Synchronized password for Fixed Admin user ${fixedAdminEmail}.`);
  }

  // 4. Seed Standard Admin User (admin@docshield.ai / AdminPassword123!) for test suites
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

    const superAdminRoleId = roleIdMap.get('super_admin');
    if (superAdminRoleId) {
      await db.execute(
        'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?);',
        [adminId, superAdminRoleId]
      );
    }
  } else {
    adminId = existingAdmin.id;
  }

  // 5. Seed Default Screening Officer User for test suites
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

    const officerRoleId = roleIdMap.get('screening_officer');
    if (officerRoleId) {
      await db.execute(
        'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?);',
        [officerId, officerRoleId]
      );
    }
  } else {
    officerId = existingOfficer.id;
  }

  // 6. Seed Default Organization and Memberships
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
        fixedAdminId || adminId,
      ]
    );
    console.log(`✅ Seeded Default Organization: DocShield Global Security Operations (${defaultOrgSlug})`);
  } else {
    defaultOrgId = existingOrg.id;
    console.log(`⏩ Default organization ${defaultOrgSlug} already exists.`);
  }

  // Map Fixed Admin to Org
  const superAdminRoleId = roleIdMap.get('super_admin');
  if (fixedAdminId && defaultOrgId && superAdminRoleId) {
    const existingMember = await db.queryOne(
      'SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?;',
      [defaultOrgId, fixedAdminId]
    );
    if (!existingMember) {
      await db.execute(
        `INSERT INTO organization_members (id, organization_id, user_id, role_id, status)
         VALUES (?, ?, ?, ?, 'ACTIVE');`,
        [uuidv4(), defaultOrgId, fixedAdminId, superAdminRoleId]
      );
    }
  }

  // Map Admin to Org
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
  const officerRoleId = roleIdMap.get('screening_officer');
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

  // 7. Seed Initial Watchlist Records
  for (const item of INITIAL_WATCHLIST_RECORDS) {
    const existing = await db.queryOne(
      'SELECT id FROM watchlists WHERE document_number = ?;',
      [item.documentNumber]
    );
    if (!existing) {
      await db.execute(
        `INSERT INTO watchlists (id, organization_id, document_number, full_name, nationality, reason, risk_level, listed_by, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          uuidv4(),
          defaultOrgId,
          item.documentNumber,
          item.fullName,
          item.nationality,
          item.reason,
          item.riskLevel,
          item.listedBy,
          JSON.stringify(item.metadata),
        ]
      );
    }
  }
  console.log(`✅ Seeded ${INITIAL_WATCHLIST_RECORDS.length} initial border screening watchlist records.`);

  console.log('🎉 [DocShield Seed] Database seeding finished successfully.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase()
    .then(async () => {
      await db.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Database seeding failed:', err);
      await db.close();
      process.exit(1);
    });
}
