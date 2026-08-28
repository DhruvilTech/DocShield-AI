// src/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { requestLogger } from './middleware/logger.middleware.js';
import { apiLimiter } from './middleware/rateLimiter.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import v1Router from './routes/index.js';

export function createApp() {
  const app = express();

  // 1. Security Headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // frontend handles own asset policies
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // 2. CORS Configuration
  app.use(
    cors({
      origin: [env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'x-organization-id'],
    })
  );

  // 3. Request Parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // 4. Logging & Rate Limiting
  app.use(requestLogger);
  app.use('/api', apiLimiter);

  // 5. Mount API Version 1
  app.use('/api/v1', v1Router);

  // 6. Root & 404 Handlers
  app.get('/', (req, res) => {
    res.json({
      name: 'DocShield AI API',
      version: '1.0.0',
      status: 'operational',
      docs: '/api/v1/health',
    });
  });

  app.use(notFoundHandler);

  // 7. Global Error Handler
  app.use(errorHandler);

  return app;
}

export default createApp;

