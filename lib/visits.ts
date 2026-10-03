import { prisma } from '@/lib/db';

const SESSION_GAP_MS = 30 * 60_000;

export async function ensureFirstVisit(memberId: string, now: Date = new Date()): Promise<boolean> {
  if (await prisma.memberVisit.findUnique({ where: { memberId } })) return false;
  await prisma.memberVisit.create({ data: { memberId, lastSeenAt: now, previousSeenAt: null } });
  return true;
}

/** Registra a visita e devolve o marco “desde a última visita” (estável durante a mesma sessão de uso). */
export async function touchVisit(memberId: string, now: Date = new Date()): Promise<Date | null> {
  const visit = await prisma.memberVisit.findUnique({ where: { memberId } });
  if (!visit) {
    await prisma.memberVisit.create({ data: { memberId, lastSeenAt: now, previousSeenAt: null } });
    return null;
  }
  if (now.getTime() - visit.lastSeenAt.getTime() > SESSION_GAP_MS) {
    await prisma.memberVisit.update({ where: { memberId }, data: { previousSeenAt: visit.lastSeenAt, lastSeenAt: now } });
    return visit.lastSeenAt;
  }
  return visit.previousSeenAt;
}
