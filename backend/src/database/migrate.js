// src/database/migrate.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log('🚀 [DocShield Migration] Initializing database migrations...');

  // 1. Ensure database exists
  const rootConn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  });

  await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await rootConn.end();

  // 2. Connect to the database
  const dbConn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: true,
  });

  try {
    // 3. Create migrations tracking table
    await dbConn.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 4. Get list of executed migrations
    const [rows] = await dbConn.query('SELECT name FROM _migrations;');
    const executedMigrations = new Set(rows.map((r) => r.name));

    // 5. Read migration directory
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

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
      } else {
        console.log(`⏩ Skipping already applied migration: ${file}`);
      }
    }

    console.log('🎉 [DocShield Migration] All migrations completed successfully.');
  } finally {
    await dbConn.end();
  }
}

// Allow direct execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}
