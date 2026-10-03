import { prisma } from '@/lib/db';

const SESSION_GAP_MS = 30 * 60_000;

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

/** Cria a visita; devolve false se outra requisição concorrente já a criou. */
async function createFirst(memberId: string, now: Date): Promise<boolean> {
  try {
    await prisma.memberVisit.create({ data: { memberId, lastSeenAt: now, previousSeenAt: null } });
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }
}

export async function ensureFirstVisit(memberId: string, now: Date = new Date()): Promise<boolean> {
  if (await prisma.memberVisit.findUnique({ where: { memberId } })) return false;
  return createFirst(memberId, now);
}

/** Registra a visita e devolve o marco “desde a última visita” (estável durante a mesma sessão de uso). */
export async function touchVisit(memberId: string, now: Date = new Date()): Promise<Date | null> {
  const visit = await prisma.memberVisit.findUnique({ where: { memberId } });
  if (!visit) {
    if (await createFirst(memberId, now)) return null;
    return (await prisma.memberVisit.findUnique({ where: { memberId } }))?.previousSeenAt ?? null;
  }
  if (now.getTime() - visit.lastSeenAt.getTime() > SESSION_GAP_MS) {
    await prisma.memberVisit.update({ where: { memberId }, data: { previousSeenAt: visit.lastSeenAt, lastSeenAt: now } });
    return visit.lastSeenAt;
  }
  return visit.previousSeenAt;
}
