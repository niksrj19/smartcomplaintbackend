import { z } from 'zod';

/**
 * Single source of truth for every environment variable.
 * The app refuses to start if anything here is missing or invalid.
 */
export const envSchema = z.object({
  // App
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // JWT — separate secrets for access and refresh tokens
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Database
  DATABASE_URL: z.string().startsWith('postgresql://', 'DATABASE_URL must be a postgresql:// URL'),

  // Provider selection — swap an implementation by changing one value
  LLM_PROVIDER: z.enum(['groq']).default('groq'),
  EMBEDDING_PROVIDER: z.enum(['gemini']).default('gemini'),
  CACHE_PROVIDER: z.enum(['redis', 'memory']).default('redis'),
  EVENT_BUS_PROVIDER: z.enum(['kafka', 'memory']).default('kafka'),
  STORAGE_PROVIDER: z.enum(['r2']).default('r2'),

  // LLM / embeddings
  GROQ_API_KEY: z.string().min(1),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),

  // Redis / Kafka
  REDIS_URL: z.string().startsWith('redis://').default('redis://localhost:6379'),
  KAFKA_BROKERS: z
    .string()
    .default('localhost:9092')
    .transform((v) => v.split(',').map((b) => b.trim()).filter(Boolean)),
  KAFKA_CLIENT_ID: z.string().default('smart-city-backend'),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().default('smart-city-photos'),

  // Gmail SMTP (App Password)
  SMTP_USER: z.email(),
  SMTP_APP_PASSWORD: z
    .string()
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().length(16, 'SMTP_APP_PASSWORD must be the 16-character Gmail app password')),

  // Browser origins allowed to call the API with cookies (comma-separated), e.g. the Next.js app
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3001')
    .transform((v) => v.split(',').map((o) => o.trim()).filter(Boolean)),

  // Citizen "Sign in with Google" — only the client ID is needed to verify ID tokens
  GOOGLE_CLIENT_ID: z.string().endsWith('.apps.googleusercontent.com', 'GOOGLE_CLIENT_ID looks wrong'),
});

export type Env = z.infer<typeof envSchema>;
