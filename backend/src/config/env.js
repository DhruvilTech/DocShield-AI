// src/config/env.js
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory or project root if present
const backendEnvPath = path.resolve(__dirname, '../../.env');
const rootEnvPath = path.resolve(__dirname, '../../../.env');

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath, override: true });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath, override: true });
} else {
  dotenv.config({ override: true });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),

  // Aiven MySQL Cloud Database
  AIVEN_MYSQL_HOST: z
    .string({
      required_error: 'AIVEN_MYSQL_HOST is required in .env (e.g. mysql-xxxx.aivencloud.com)',
    })
    .min(1, 'AIVEN_MYSQL_HOST cannot be empty'),
  AIVEN_MYSQL_PORT: z.preprocess(
    (val) => (val === undefined || val === '' ? undefined : Number(val)),
    z
      .number({
        required_error: 'AIVEN_MYSQL_PORT is required in .env (e.g. 12345)',
        invalid_type_error: 'AIVEN_MYSQL_PORT must be a valid positive integer',
      })
      .int()
      .positive('AIVEN_MYSQL_PORT must be a positive integer')
  ),
  AIVEN_MYSQL_USER: z
    .string({
      required_error: 'AIVEN_MYSQL_USER is required in .env (e.g. avnadmin)',
    })
    .min(1, 'AIVEN_MYSQL_USER cannot be empty'),
  AIVEN_MYSQL_PASSWORD: z
    .string({
      required_error: 'AIVEN_MYSQL_PASSWORD is required in .env',
    })
    .min(1, 'AIVEN_MYSQL_PASSWORD cannot be empty'),
  AIVEN_MYSQL_DB: z
    .string({
      required_error: 'AIVEN_MYSQL_DB is required in .env (e.g. defaultdb or docshield_ai)',
    })
    .min(1, 'AIVEN_MYSQL_DB cannot be empty'),
  AIVEN_MYSQL_CA: z.string().optional(),
  AIVEN_MYSQL_CONNECTION_LIMIT: z.coerce.number().default(10),
  AIVEN_MYSQL_SSL_REJECT_UNAUTHORIZED: z.coerce.boolean().default(true),

  // Kafka Configuration (Optional)
  KAFKA_HOST: z.string().optional(),
  KAFKA_PORT: z.coerce.number().optional(),
  KAFKA_USER: z.string().optional(),
  KAFKA_PASSWORD: z.string().optional(),
  KAFKA_CA: z.string().optional(),

  // JWT Security
  JWT_ACCESS_SECRET: z.string().min(16).default('docshield_access_secret_key_2026_prod_ready_sec_token_v1'),
  JWT_REFRESH_SECRET: z.string().min(16).default('docshield_refresh_secret_key_2026_prod_ready_sec_token_v1'),
  JWT_ACCESS_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_EXPIRATION: z.string().default('7d'),

  // CORS
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // Security policies
  BCRYPT_SALT_ROUNDS: z.coerce.number().default(12),
  EMAIL_VERIFICATION_EXPIRATION_HOURS: z.coerce.number().default(24),
  PASSWORD_RESET_EXPIRATION_HOURS: z.coerce.number().default(1),

  // Cloudinary Storage
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_URL: z.string().optional(),
  CLOUDINARY_SECURE: z.coerce.boolean().default(true),

  // AI & Document Intelligence Provider
  AI_PROVIDER: z.enum(['heuristic', 'gemini', 'openai', 'mock']).default('heuristic'),
  AI_MODEL: z.string().default('docshield-intelligence-v1'),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('\n❌ [DocShield Config] Missing or invalid environment configuration:');
    const issues = result.error.issues;
    for (const issue of issues) {
      console.error(`   ▶ ${issue.path.join('.')}: ${issue.message}`);
    }
    console.error('\n⚠️  Please update your backend/.env file with all required AIVEN_MYSQL_* variables.\n');
    process.exit(1);
  }
  return result.data;
};

export const env = parseEnv();
