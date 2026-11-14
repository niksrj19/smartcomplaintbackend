import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Department, Prisma } from '../../generated/prisma/client.js';
import { CACHE_SERVICE, type CacheService } from '../../ports/cache.service.js';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from '../../ports/embedding.provider.js';
import { DepartmentsRepository } from './departments.repository.js';
import type {
  CreateDepartmentDto,
  DepartmentMatch,
  DepartmentResponse,
  UpdateDepartmentDto,
} from './dto/department.schemas.js';

const ACTIVE_CACHE_KEY = 'departments:active';
const CACHE_TTL_SECONDS = 300;

@Injectable()
export class DepartmentsService {
  private readonly logger = new Logger(DepartmentsService.name);

  constructor(
    private readonly repo: DepartmentsRepository,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
    @Inject(CACHE_SERVICE) private readonly cache: CacheService,
  ) {}

  async list(includeInactive = false): Promise<DepartmentResponse[]> {
    if (!includeInactive) {
      const cached = await this.cache.get<DepartmentResponse[]>(ACTIVE_CACHE_KEY);
      if (cached) return cached;
    }
    const departments = (await this.repo.findAll(includeInactive)).map((d) => this.toResponse(d));
    if (!includeInactive) await this.cache.set(ACTIVE_CACHE_KEY, departments, CACHE_TTL_SECONDS);
    return departments;
  }

  async getById(id: string): Promise<DepartmentResponse> {
    const dept = await this.repo.findById(id);
    if (!dept) throw new NotFoundException(`Department ${id} not found`);
    return this.toResponse(dept);
  }

  /** Used by the AI layer to check the LLM picked a real, active department */
  async findActiveByCode(code: string): Promise<DepartmentResponse | null> {
    const dept = await this.repo.findByCode(code.toUpperCase());
    return dept?.isActive ? this.toResponse(dept) : null;
  }

  async create(dto: CreateDepartmentDto): Promise<DepartmentResponse> {
    try {
      const dept = await this.repo.create(dto);
      await this.refreshEmbedding(dept);
      await this.cache.del(ACTIVE_CACHE_KEY);
      return this.toResponse(dept);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Department code "${dto.code}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateDepartmentDto): Promise<DepartmentResponse> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Department ${id} not found`);

    const dept = await this.repo.update(id, dto);
    const textChanged =
      (dto.name !== undefined && dto.name !== existing.name) ||
      (dto.description !== undefined && dto.description !== existing.description);
    if (textChanged) await this.refreshEmbedding(dept);

    await this.cache.del(ACTIVE_CACHE_KEY);
    return this.toResponse(dept);
  }

  /** Soft delete — complaints still reference the department */
  async deactivate(id: string): Promise<DepartmentResponse> {
    return this.update(id, { isActive: false });
  }

  /** Semantic match of complaint text → closest departments (used by the AI classifier node) */
  async findBestMatches(text: string, limit = 3): Promise<DepartmentMatch[]> {
    const vector = await this.embeddings.embed(text, 'query');
    return this.repo.findNearest(vector, limit);
  }

  /** Embeds any active department that doesn't have an embedding yet (seeded rows, past failures) */
  async syncMissingEmbeddings(): Promise<number> {
    const missing = await this.repo.findMissingEmbeddings();
    if (missing.length === 0) return 0;

    const vectors = await this.embeddings.embedMany(
      missing.map((d) => this.embeddingText(d.name, d.description)),
      'document',
    );
    await Promise.all(missing.map((d, i) => this.repo.setEmbedding(d.id, vectors[i])));
    return missing.length;
  }

  /**
   * If embedding fails, the column is cleared so the next sync retries it —
   * a Gemini outage never blocks creating or editing a department.
   */
  private async refreshEmbedding(dept: Department): Promise<void> {
    try {
      const vector = await this.embeddings.embed(this.embeddingText(dept.name, dept.description), 'document');
      await this.repo.setEmbedding(dept.id, vector);
    } catch (err) {
      this.logger.warn(`Embedding failed for ${dept.code}, will retry on next sync: ${(err as Error).message}`);
      await this.repo.setEmbedding(dept.id, null);
    }
  }

  private embeddingText(name: string, description: string): string {
    return `${name}. ${description}`;
  }

  private toResponse(d: Department): DepartmentResponse {
    return {
      id: d.id,
      code: d.code,
      name: d.name,
      description: d.description,
      contactEmail: d.contactEmail,
      sla: {
        criticalHours: d.slaHoursCritical,
        highHours: d.slaHoursHigh,
        normalHours: d.slaHoursNormal,
        lowHours: d.slaHoursLow,
      },
      isActive: d.isActive,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }
}
