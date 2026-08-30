// src/database/migrate.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { getDatabaseSSLConfig } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log('🚀 [DocShield Migration] Initializing migrations for Aiven MySQL...');
  console.log(`🌐 Target Host: ${env.AIVEN_MYSQL_HOST}:${env.AIVEN_MYSQL_PORT}`);
  console.log(`🗄️  Database: ${env.AIVEN_MYSQL_DB}`);

  // Connect securely to Aiven MySQL
  const dbConn = await mysql.createConnection({
    host: env.AIVEN_MYSQL_HOST,
    port: env.AIVEN_MYSQL_PORT,
    user: env.AIVEN_MYSQL_USER,
    password: env.AIVEN_MYSQL_PASSWORD,
    database: env.AIVEN_MYSQL_DB,
    ssl: getDatabaseSSLConfig(env.AIVEN_MYSQL_CA, env.AIVEN_MYSQL_SSL_REJECT_UNAUTHORIZED),
    multipleStatements: true,
  });

  try {
    // 1. Create migrations tracking table if not exists
    await dbConn.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. Get list of already executed migrations
    const [rows] = await dbConn.query('SELECT name FROM _migrations;');
    const executedMigrations = new Set(rows.map((r) => r.name));

    // 3. Read migration directory
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    let appliedCount = 0;
    for (const file of files) {
      if (!executedMigrations.has(file)) {
        console.log(`⏳ Applying migration: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sqlContent = fs.readFileSync(filePath, 'utf-8');

        // Execute migration
        await dbConn.query(sqlContent);

        // Record execution
        await dbConn.query('INSERT INTO _migrations (name) VALUES (?);', [file]);
        console.log(`✅ Applied migration: ${file}`);
        appliedCount++;
      } else {
        console.log(`⏩ Skipping already applied migration: ${file}`);
      }
    }

    console.log(`🎉 [DocShield Migration] Finished. (${appliedCount} new migrations applied)`);
  } catch (error) {
    console.error('❌ Migration execution error:', error.message);
    throw error;
  } finally {
    await dbConn.end();
  }
}

// Allow direct CLI execution: node src/database/migrate.js
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}
