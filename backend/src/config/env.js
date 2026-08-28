// src/config/env.js
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });


const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),

  // MySQL Database
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().default(3306),
  DB_NAME: z.string().default('docshield_ai'),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_CONNECTION_LIMIT: z.coerce.number().default(10),

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
    console.error('Invalid environment configuration:');
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
};

export const env = parseEnv();
