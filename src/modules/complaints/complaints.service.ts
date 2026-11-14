import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from '../../ports/embedding.provider.js';
import { StorageService } from '../storage/storage.service.js';
import {
  type CitizenComplaintDetail,
  type CitizenComplaintListItem,
  type CreatedComplaint,
  ComplaintsRepository,
} from './complaints.repository.js';

export interface SubmitDraftInput {
  citizenId: string;
  sessionId: string;
  draftId: string;
  idempotencyKey: string;
}

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    private readonly repo: ComplaintsRepository,
    private readonly storage: StorageService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
  ) {}

  /** For retried Submit clicks: the complaint already created from this draft, if any */
  async findSubmitted(
    citizenId: string,
    sessionId: string,
    draftId: string,
    idempotencyKey: string,
  ): Promise<CreatedComplaint | null> {
    const draft = await this.repo.findDraft(draftId);
    if (!draft || draft.sessionId !== sessionId || draft.session.citizenId !== citizenId) return null;
    return (await this.repo.findByIdempotencyKey(idempotencyKey)) ?? (await this.repo.findByDraftId(draftId));
  }

  /**
   * Turns a confirmed draft into a real complaint. Called ONLY from the citizen's Submit click —
   * the LLM can never trigger this. Safe to call twice with the same idempotency key.
   */
  async submitDraft({ citizenId, sessionId, draftId, idempotencyKey }: SubmitDraftInput): Promise<CreatedComplaint> {
    // Same key again (double click, network retry) → return the complaint we already created
    const existing = await this.repo.findByIdempotencyKey(idempotencyKey);
    if (existing) return existing;

    const draft = await this.repo.findDraft(draftId);
    if (!draft || draft.sessionId !== sessionId || draft.session.citizenId !== citizenId) {
      throw new NotFoundException('Draft not found');
    }
    if (draft.status !== 'PENDING') {
      const done = await this.repo.findByDraftId(draftId);
      if (done) return done;
      throw new ConflictException('This draft has been replaced by a newer version. Please submit the latest one.');
    }

    // Never trust photo keys from the client or the LLM — check each really exists in storage
    const photos = await this.storage.verifyPhotos(draft.photoKeys);

    // Embedding is computed before the transaction; if Gemini is down the complaint still saves
    let embedding: number[] | null = null;
    try {
      embedding = await this.embeddings.embed(`${draft.title}. ${draft.description}`, 'document');
    } catch (err) {
      this.logger.warn(`Complaint embedding skipped: ${(err as Error).message}`);
    }

    try {
      const created = await this.repo.createFromDraft({ citizenId, draft, idempotencyKey, photos, embedding });
      this.logger.log(`Complaint ${created.ticketNumber} created (dept ${draft.department.code}, ${draft.priority})`);
      return created;
    } catch (err) {
      // Two simultaneous submits: the loser hits a unique constraint — return the winner's result
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = (await this.repo.findByIdempotencyKey(idempotencyKey)) ?? (await this.repo.findByDraftId(draftId));
        if (winner) return winner;
      }
      throw err;
    }
  }

  async listForCitizen(
    citizenId: string,
    opts: { page: number; pageSize: number; status?: string },
  ): Promise<{ items: CitizenComplaintListItem[]; total: number; page: number; pageSize: number }> {
    const { items, total } = await this.repo.listForCitizen(citizenId, opts);
    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  /** Detail with short-lived photo links (the citizen never gets raw storage access) */
  async getForCitizen(
    citizenId: string,
    ticketNumber: string,
  ): Promise<Omit<CitizenComplaintDetail, 'photoKeys'> & { photos: { url: string; expiresAt: Date }[] }> {
    const complaint = await this.repo.findForCitizen(citizenId, ticketNumber);
    if (!complaint) throw new NotFoundException('Complaint not found');
    const { photoKeys, ...rest } = complaint;
    const photos = await Promise.all(
      photoKeys.map(async (key) => {
        const link = await this.storage.createViewUrl(key);
        return { url: link.url, expiresAt: link.expiresAt };
      }),
    );
    return { ...rest, photos };
  }
}
