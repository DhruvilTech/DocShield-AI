// src/database/db.js
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

class Database {
  constructor() {
    this.pool = null;
  }

  getPool() {
    if (!this.pool) {
      this.pool = mysql.createPool({
        host: env.DB_HOST,
        port: env.DB_PORT,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
        waitForConnections: true,
        connectionLimit: env.DB_CONNECTION_LIMIT,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        dateStrings: true,
      });
    }
    return this.pool;
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
   * Ping database to check connectivity
   */
  async healthCheck() {
    const start = Date.now();
    try {
      await this.query('SELECT 1 AS health;');
      return {
        connected: true,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        connected: false,
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
