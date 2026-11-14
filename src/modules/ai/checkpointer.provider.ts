import { Inject, Injectable, Logger, type OnModuleDestroy, type Provider } from '@nestjs/common';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { AppConfigService } from '../../config/app-config.service.js';

export const CHECKPOINTER = Symbol('CHECKPOINTER');

/**
 * Saves the agent's state after every node in Postgres (its own tables, created by setup()).
 * A chat survives page refreshes and server restarts; the session id is the thread id.
 */
export const checkpointerProvider: Provider = {
  provide: CHECKPOINTER,
  inject: [AppConfigService],
  useFactory: async (config: AppConfigService): Promise<PostgresSaver> => {
    // Prisma's ?schema=public isn't understood by node-postgres, so strip query params
    const url = config.database.url.split('?')[0];
    const saver = PostgresSaver.fromConnString(url);
    await saver.setup();
    new Logger('Checkpointer').log('LangGraph checkpointer ready (Postgres)');
    return saver;
  },
};

/** Closes the checkpointer's connection pool on shutdown */
@Injectable()
export class CheckpointerShutdown implements OnModuleDestroy {
  constructor(@Inject(CHECKPOINTER) private readonly saver: PostgresSaver) {}

  async onModuleDestroy(): Promise<void> {
    await this.saver.end();
  }
}
