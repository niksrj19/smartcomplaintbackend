import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import type { NewRefreshToken, RefreshTokenStore, StoredRefreshToken } from '../../auth-core/refresh-token.store.js';

/** Staff refresh tokens live in `refresh_tokens` (staff_user_id) */
@Injectable()
export class StaffRefreshTokenStore implements RefreshTokenStore {
  constructor(private readonly prisma: PrismaService) {}

  async create(t: NewRefreshToken): Promise<void> {
    await this.prisma.refreshToken.create({
      data: { staffUserId: t.principalId, tokenHash: t.tokenHash, familyId: t.familyId, expiresAt: t.expiresAt },
    });
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    const t = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    return t ? { id: t.id, principalId: t.staffUserId, familyId: t.familyId, revokedAt: t.revokedAt } : null;
  }

  async rotate(oldId: string, next: NewRefreshToken): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { id: oldId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) return false;
      await tx.refreshToken.create({
        data: { staffUserId: next.principalId, tokenHash: next.tokenHash, familyId: next.familyId, expiresAt: next.expiresAt },
      });
      return true;
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
