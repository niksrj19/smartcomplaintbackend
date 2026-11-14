import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import type { Prisma, StaffUser } from '../../../generated/prisma/client.js';

@Injectable()
export class StaffRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<StaffUser | null> {
    return this.prisma.staffUser.findUnique({ where: { email } });
  }

  findById(id: string): Promise<StaffUser | null> {
    return this.prisma.staffUser.findUnique({ where: { id } });
  }

  findMany(where: Prisma.StaffUserWhereInput): Promise<StaffUser[]> {
    return this.prisma.staffUser.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  create(data: Prisma.StaffUserUncheckedCreateInput): Promise<StaffUser> {
    return this.prisma.staffUser.create({ data });
  }

  touchLastLogin(id: string): Promise<StaffUser> {
    return this.prisma.staffUser.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }
}
