// src/database/db.js
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

/**
 * Resolves SSL configuration for Aiven MySQL
 * Supports raw PEM strings, escaped newlines, Base64 strings, or file paths to CA certs.
 */
export function getDatabaseSSLConfig(caValue, rejectUnauthorized = true) {
  if (!caValue || typeof caValue !== 'string' || caValue.trim() === '') {
    // If no custom CA is provided, still enforce SSL encryption with rejectUnauthorized option
    return {
      rejectUnauthorized: rejectUnauthorized === true,
    };
  }

  let caContent = caValue.trim();

  // Check if caValue is a path to an existing file
  try {
    const resolvedPath = path.isAbsolute(caContent)
      ? caContent
      : path.resolve(process.cwd(), caContent);

    if (fs.existsSync(resolvedPath)) {
      caContent = fs.readFileSync(resolvedPath, 'utf8');
    }
  } catch {
    // Not a file path, treat as certificate string
  }

  // If CA is Base64 encoded PEM, decode it
  if (!caContent.includes('-----BEGIN CERTIFICATE-----')) {
    try {
      const decoded = Buffer.from(caContent, 'base64').toString('utf8');
      if (decoded.includes('-----BEGIN CERTIFICATE-----')) {
        caContent = decoded;
      }
    } catch {
      // Keep as-is
    }
  }

  // Handle literal escaped newlines "\n" from .env
  if (caContent.includes('\\n')) {
    caContent = caContent.replace(/\\n/g, '\n');
  }

  return {
    ca: caContent,
    rejectUnauthorized: rejectUnauthorized !== false,
  };
}

/**
 * Returns connection configuration for Aiven MySQL
 */
export function getDatabaseConfig() {
  return {
    host: env.AIVEN_MYSQL_HOST,
    port: env.AIVEN_MYSQL_PORT,
    user: env.AIVEN_MYSQL_USER,
    password: env.AIVEN_MYSQL_PASSWORD,
    database: env.AIVEN_MYSQL_DB,
    ssl: getDatabaseSSLConfig(env.AIVEN_MYSQL_CA, env.AIVEN_MYSQL_SSL_REJECT_UNAUTHORIZED),
    waitForConnections: true,
    connectionLimit: env.AIVEN_MYSQL_CONNECTION_LIMIT,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: 'Z',
  };
}

class Database {
  constructor() {
    this.pool = null;
  }

  /**
   * Returns active Aiven MySQL connection pool or creates a new one
   */
  getPool() {
    if (!this.pool) {
      this.pool = mysql.createPool(getDatabaseConfig());
    }
    return this.pool;
  }

  /**
   * Acquire a direct connection from the pool
   */
  async getConnection() {
    const pool = this.getPool();
    return await pool.getConnection();
  }

  /**
   * Execute a parameterized SELECT query returning rows
   */
  async query(sql, params = []) {
    const pool = this.getPool();
    const [rows] = await pool.query(sql, params);
    return rows;
  }

  /**
   * Execute a single SELECT query expecting at most one row
   */
  async queryOne(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Execute an INSERT, UPDATE, or DELETE query returning ResultSetHeader
   */
  async execute(sql, params = []) {
    const pool = this.getPool();
    const [result] = await pool.execute(sql, params);
    return result;
  }

  /**
   * Run a callback within a managed database transaction
   */
  async transaction(callback) {
    const pool = this.getPool();
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Ping database to check connectivity and SSL status
   */
  async healthCheck() {
    const start = Date.now();
    try {
      const rows = await this.query('SELECT 1 AS health, CURRENT_TIMESTAMP() AS server_time, @@ssl_cipher AS ssl_cipher;');
      const sslCipher = rows && rows[0] ? rows[0].ssl_cipher : null;
      return {
        connected: true,
        ssl: Boolean(sslCipher),
        sslCipher: sslCipher || 'Enabled',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        connected: false,
        ssl: false,
        error: error.message,
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Graceful shutdown of connection pool
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

export const db = new Database();
