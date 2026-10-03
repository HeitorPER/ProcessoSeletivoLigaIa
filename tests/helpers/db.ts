import { prisma } from '@/lib/db';
import { seedBase } from '@/prisma/seed-data';

export async function resetDb(): Promise<void> {
  await prisma.$transaction([
    prisma.activityEvent.deleteMany(),
    prisma.reference.deleteMany(),
    prisma.suggestion.deleteMany(),
    prisma.discardedItem.deleteMany(),
    prisma.activityOwner.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.source.deleteMany(),
    prisma.syncRun.deleteMany(),
    prisma.syncRequest.deleteMany(),
    prisma.googleToken.deleteMany(),
    prisma.memberVisit.deleteMany(),
    prisma.member.deleteMany(),
    prisma.syncState.deleteMany(),
  ]);
  await seedBase(prisma);
}
