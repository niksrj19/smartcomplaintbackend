import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import type { Citizen } from '../../../generated/prisma/client.js';
import type { VerifiedIdentity } from '../../../ports/identity-verifier.js';

@Injectable()
export class CitizenRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Citizen | null> {
    return this.prisma.citizen.findUnique({ where: { id } });
  }

  /**
   * Find by Google id first (stable), then by email (links a citizen row created before
   * Google sign-in existed), otherwise create. Always refreshes avatar and last login.
   */
  async upsertFromGoogle(identity: VerifiedIdentity): Promise<Citizen> {
    const now = new Date();
    const bySub = await this.prisma.citizen.findUnique({ where: { googleSub: identity.subject } });
    if (bySub) {
      return this.prisma.citizen.update({
        where: { id: bySub.id },
        data: { email: identity.email, avatarUrl: identity.pictureUrl, lastLoginAt: now },
      });
    }

    const byEmail = await this.prisma.citizen.findUnique({ where: { email: identity.email } });
    if (byEmail) {
      return this.prisma.citizen.update({
        where: { id: byEmail.id },
        data: { googleSub: identity.subject, avatarUrl: identity.pictureUrl, lastLoginAt: now },
      });
    }

    return this.prisma.citizen.create({
      data: {
        name: identity.name,
        email: identity.email,
        googleSub: identity.subject,
        avatarUrl: identity.pictureUrl,
        lastLoginAt: now,
      },
    });
  }
}
