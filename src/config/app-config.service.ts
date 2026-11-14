import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema.js';

/**
 * Typed, grouped access to configuration.
 * Other modules inject AppConfigService — never read process.env directly.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get app() {
    return {
      port: this.get('PORT'),
      env: this.get('NODE_ENV'),
      isProduction: this.get('NODE_ENV') === 'production',
    };
  }

  get jwt() {
    return {
      accessSecret: this.get('JWT_ACCESS_SECRET'),
      accessExpiresIn: this.get('JWT_ACCESS_EXPIRES_IN'),
      refreshSecret: this.get('JWT_REFRESH_SECRET'),
      refreshExpiresIn: this.get('JWT_REFRESH_EXPIRES_IN'),
    };
  }

  get database() {
    return { url: this.get('DATABASE_URL') };
  }

  get providers() {
    return {
      llm: this.get('LLM_PROVIDER'),
      embedding: this.get('EMBEDDING_PROVIDER'),
      cache: this.get('CACHE_PROVIDER'),
      eventBus: this.get('EVENT_BUS_PROVIDER'),
      storage: this.get('STORAGE_PROVIDER'),
    };
  }

  get groq() {
    return { apiKey: this.get('GROQ_API_KEY'), model: this.get('GROQ_MODEL') };
  }

  get gemini() {
    return { apiKey: this.get('GEMINI_API_KEY'), embeddingModel: this.get('GEMINI_EMBEDDING_MODEL') };
  }

  get redis() {
    return { url: this.get('REDIS_URL') };
  }

  get kafka() {
    return { brokers: this.get('KAFKA_BROKERS'), clientId: this.get('KAFKA_CLIENT_ID') };
  }

  get r2() {
    const accountId = this.get('R2_ACCOUNT_ID');
    return {
      accountId,
      accessKeyId: this.get('R2_ACCESS_KEY_ID'),
      secretAccessKey: this.get('R2_SECRET_ACCESS_KEY'),
      bucket: this.get('R2_BUCKET'),
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    };
  }

  get cors() {
    return { origins: this.get('CORS_ORIGINS') };
  }

  get google() {
    return { clientId: this.get('GOOGLE_CLIENT_ID') };
  }

  get smtp() {
    return {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      user: this.get('SMTP_USER'),
      appPassword: this.get('SMTP_APP_PASSWORD'),
    };
  }
}
