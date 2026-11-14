import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import type { NewRefreshToken, RefreshTokenStore, StoredRefreshToken } from '../../auth-core/refresh-token.store.js';

/** Citizen refresh tokens live in their own table, `citizen_refresh_tokens` */
@Injectable()
export class CitizenRefreshTokenStore implements RefreshTokenStore {
  constructor(private readonly prisma: PrismaService) {}

  async create(t: NewRefreshToken): Promise<void> {
    await this.prisma.citizenRefreshToken.create({
      data: { citizenId: t.principalId, tokenHash: t.tokenHash, familyId: t.familyId, expiresAt: t.expiresAt },
    });
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    const t = await this.prisma.citizenRefreshToken.findUnique({ where: { tokenHash } });
    return t ? { id: t.id, principalId: t.citizenId, familyId: t.familyId, revokedAt: t.revokedAt } : null;
  }

  async rotate(oldId: string, next: NewRefreshToken): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.citizenRefreshToken.updateMany({
        where: { id: oldId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) return false;
      await tx.citizenRefreshToken.create({
        data: { citizenId: next.principalId, tokenHash: next.tokenHash, familyId: next.familyId, expiresAt: next.expiresAt },
      });
      return true;
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.citizenRefreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
