import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { DepartmentsService } from './departments.service.js';

/**
 * On startup, embeds any department that doesn't have an embedding yet
 * (e.g. rows inserted by the seed script). Runs in the background so startup isn't delayed.
 */
@Injectable()
export class DepartmentEmbeddingSync implements OnApplicationBootstrap {
  private readonly logger = new Logger(DepartmentEmbeddingSync.name);

  constructor(private readonly departments: DepartmentsService) {}

  onApplicationBootstrap(): void {
    this.departments
      .syncMissingEmbeddings()
      .then((count) => {
        if (count > 0) this.logger.log(`Generated embeddings for ${count} department(s)`);
      })
      .catch((err: unknown) =>
        this.logger.warn(`Department embedding sync failed: ${err instanceof Error ? err.message : err}`),
      );
  }

}
