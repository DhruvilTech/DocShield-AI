// src/server.js
import { createApp } from './app.js';
import { env } from './config/env.js';
import { db } from './database/db.js';
import { logger } from './utils/logger.js';
import { runMigrations } from './database/migrate.js';
import { seedDatabase } from './database/seed.js';

async function bootstrap() {
  try {
    logger.info('🛡️  DocShield AI Backend starting up...');

    // Auto-run migrations and seeds on startup if in development/test
    if (env.NODE_ENV !== 'production') {
      await runMigrations();
      await seedDatabase();
    }

    // Verify DB connectivity
    const health = await db.healthCheck();
    if (!health.connected) {
      logger.error(`❌ Aiven MySQL connectivity check failed: ${health.error || 'Check Aiven connection parameters.'}`);
    } else {
      logger.info(`✅ Aiven MySQL Database connected (${health.latencyMs}ms latency, SSL Cipher: ${health.sslCipher})`);
    }

    const app = createApp();

    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 DocShield AI Server running on port ${env.PORT} [${env.NODE_ENV}]`);
      logger.info(`📡 API Base URL: http://localhost:${env.PORT}/api/v1`);
      logger.info(`🌐 Allowed Frontend Origin: ${env.FRONTEND_URL}`);
    });

    // Graceful Shutdown Handling
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      server.close(async () => {
        logger.info('HTTP server closed.');
        await db.close();
        logger.info('MySQL connection pool closed.');
        process.exit(0);
      });

      // Force shutdown after 10s if dangling connections
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Fatal error during startup bootstrap:', error);
    process.exit(1);
  }
}

bootstrap();
