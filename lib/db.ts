import 'dotenv/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient, type Prisma } from '@/generated/prisma/client';
import { resolveDbUrl } from '@/lib/db-url';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: resolveDbUrl() }) });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** Cliente normal ou cliente de transação interativa. */
export type Db = PrismaClient | Prisma.TransactionClient;
