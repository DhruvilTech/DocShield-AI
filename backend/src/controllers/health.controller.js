// src/controllers/health.controller.js
import { db } from '../database/db.js';
import { ResponseUtil } from '../utils/response.js';

export class HealthController {
  checkHealth = async (req, res, next) => {
    try {
      const dbHealth = await db.healthCheck();

      const healthStatus = {
        status: dbHealth.connected ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          status: dbHealth.connected ? 'connected' : 'disconnected',
          latencyMs: dbHealth.latencyMs,
        },
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      };

      const statusCode = dbHealth.connected ? 200 : 503;
      return res.status(statusCode).json({
        success: dbHealth.connected,
        data: healthStatus,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const healthController = new HealthController();
