import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { CACHE_SERVICE, type CacheService } from '../ports/cache.service.js';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from '../ports/embedding.provider.js';
import { EVENT_BUS_ADMIN } from '../ports/event-bus-admin.js';
import { EVENT_CONSUMER } from '../ports/event-consumer.js';
import { EVENT_PUBLISHER } from '../ports/event-publisher.js';
import { IDENTITY_VERIFIER, type IdentityVerifier } from '../ports/identity-verifier.js';
import { LLM_PROVIDER, type LlmProvider } from '../ports/llm.provider.js';
import { MAILER, type Mailer } from '../ports/mailer.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../ports/object-storage.js';
import { GeminiEmbeddingAdapter } from './gemini-embedding/gemini-embedding.adapter.js';
import { GoogleIdentityAdapter } from './google/google-identity.adapter.js';
import { GroqLlmAdapter } from './groq/groq-llm.adapter.js';
import { InMemoryEventBusAdapter } from './kafka/in-memory-event-bus.adapter.js';
import { KafkaEventBusAdapter } from './kafka/kafka-event-bus.adapter.js';
import { R2StorageAdapter } from './r2/r2-storage.adapter.js';
import { InMemoryCacheAdapter } from './redis/in-memory-cache.adapter.js';
import { SmtpMailerAdapter } from './smtp/smtp-mailer.adapter.js';
import { RedisCacheAdapter } from './redis/redis-cache.adapter.js';

const EVENT_BUS = Symbol('EVENT_BUS');

/**
 * The ONLY place that knows which vendor backs each port.
 * To switch vendors: write a new adapter, add a case here, change the value in .env.
 * Only the selected adapter is created, so e.g. Redis isn't contacted when CACHE_PROVIDER=memory.
 */
@Global()
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): LlmProvider => {
        switch (config.providers.llm) {
          case 'groq':
            return new GroqLlmAdapter(config);
        }
      },
    },
    {
      provide: EMBEDDING_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): EmbeddingProvider => {
        switch (config.providers.embedding) {
          case 'gemini':
            return new GeminiEmbeddingAdapter(config);
        }
      },
    },
    {
      provide: CACHE_SERVICE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): CacheService => {
        switch (config.providers.cache) {
          case 'redis':
            return new RedisCacheAdapter(config);
          case 'memory':
            return new InMemoryCacheAdapter();
        }
      },
    },
    {
      // One instance serves as both publisher and consumer
      provide: EVENT_BUS,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        switch (config.providers.eventBus) {
          case 'kafka':
            return new KafkaEventBusAdapter(config);
          case 'memory':
            return new InMemoryEventBusAdapter();
        }
      },
    },
    { provide: EVENT_PUBLISHER, useExisting: EVENT_BUS },
    { provide: EVENT_CONSUMER, useExisting: EVENT_BUS },
    { provide: EVENT_BUS_ADMIN, useExisting: EVENT_BUS },
    {
      provide: IDENTITY_VERIFIER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): IdentityVerifier => new GoogleIdentityAdapter(config),
    },
    {
      provide: MAILER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): Mailer => new SmtpMailerAdapter(config),
    },
    {
      provide: OBJECT_STORAGE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): ObjectStorage => {
        switch (config.providers.storage) {
          case 'r2':
            return new R2StorageAdapter(config);
        }
      },
    },
  ],
  exports: [
    LLM_PROVIDER,
    EMBEDDING_PROVIDER,
    CACHE_SERVICE,
    EVENT_PUBLISHER,
    EVENT_CONSUMER,
    EVENT_BUS_ADMIN,
    OBJECT_STORAGE,
    MAILER,
    IDENTITY_VERIFIER,
  ],
})
export class AdaptersModule {}
