import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { type Department, Prisma } from '../../generated/prisma/client.js';
import type { DepartmentMatch } from './dto/department.schemas.js';

/** The only class that talks to the departments table. */
@Injectable()
export class DepartmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeInactive: boolean): Promise<Department[]> {
    return this.prisma.department.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string): Promise<Department | null> {
    return this.prisma.department.findUnique({ where: { id } });
  }

  findByCode(code: string): Promise<Department | null> {
    return this.prisma.department.findUnique({ where: { code } });
  }

  create(data: Prisma.DepartmentCreateInput): Promise<Department> {
    return this.prisma.department.create({ data });
  }

  update(id: string, data: Prisma.DepartmentUpdateInput): Promise<Department> {
    return this.prisma.department.update({ where: { id }, data });
  }

  // ─── pgvector (Prisma can't type vector columns, so these use raw SQL) ───

  async setEmbedding(id: string, embedding: number[] | null): Promise<void> {
    if (embedding === null) {
      await this.prisma.$executeRaw`UPDATE departments SET embedding = NULL WHERE id = ${id}::uuid`;
      return;
    }
    await this.prisma.$executeRaw`
      UPDATE departments SET embedding = ${this.toVector(embedding)}::vector WHERE id = ${id}::uuid`;
  }

  findMissingEmbeddings(): Promise<Pick<Department, 'id' | 'name' | 'description'>[]> {
    return this.prisma.$queryRaw`
      SELECT id, name, description FROM departments
      WHERE embedding IS NULL AND is_active = true`;
  }

  /** Cosine distance search (<=>). Similarity = 1 - distance. */
  async findNearest(embedding: number[], limit: number): Promise<DepartmentMatch[]> {
    const rows = await this.prisma.$queryRaw<{ id: string; code: string; name: string; distance: number }[]>`
      SELECT id, code, name, (embedding <=> ${this.toVector(embedding)}::vector) AS distance
      FROM departments
      WHERE is_active = true AND embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      similarity: Number((1 - Number(r.distance)).toFixed(4)),
    }));
  }

  /** pgvector's text format: [0.1,0.2,...] */
  private toVector(values: number[]): string {
    return `[${values.join(',')}]`;
  }
}
