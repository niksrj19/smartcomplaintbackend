/**
 * Creates the first SUPER_ADMIN (nobody can log in to create one otherwise).
 *
 * Run:
 *   npx tsx scripts/create-super-admin.ts --name "Nitesh Tak" --email admin@example.com --password "Admin@1234"
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/client.js';

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    email: { type: 'string' },
    password: { type: 'string' },
  },
});

async function main() {
  const { name, email, password } = values;
  if (!name || !email || !password) {
    throw new Error('Usage: --name "Full Name" --email you@example.com --password "StrongPass1"');
  }
  if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('Password needs 8+ characters with uppercase, lowercase and a number');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    const user = await prisma.staffUser.upsert({
      where: { email: email.toLowerCase() },
      update: { name, passwordHash: await bcrypt.hash(password, 12), role: 'SUPER_ADMIN', departmentId: null, isActive: true },
      create: {
        name,
        email: email.toLowerCase(),
        passwordHash: await bcrypt.hash(password, 12),
        role: 'SUPER_ADMIN',
      },
    });
    console.log(`Super admin ready: ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
