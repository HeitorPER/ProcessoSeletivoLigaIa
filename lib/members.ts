import { prisma, type Db } from '@/lib/db';
import { parseJson } from '@/lib/json';
import type { MemberInfo } from '@/lib/types';

export function toMemberInfo(row: { id: string; displayName: string; front: string; role: string; reviewFronts: string }): MemberInfo {
  return { id: row.id, displayName: row.displayName, front: row.front, role: row.role === 'reviewer' ? 'reviewer' : 'member', reviewFronts: parseJson<string[]>(row.reviewFronts, []) };
}

export async function loadMembers(db: Db = prisma): Promise<MemberInfo[]> {
  const rows = await db.member.findMany({ orderBy: { id: 'asc' } });
  return rows.map(toMemberInfo);
}

/** Revisor dedicado da frente revisa; frentes sem revisor dedicado (ou sem frente) aceitam qualquer revisor. */
export function canReview(member: MemberInfo, front: string | null, all: MemberInfo[]): boolean {
  if (member.role !== 'reviewer') return false;
  if (!front) return true;
  const hasDedicated = all.some((m) => m.role === 'reviewer' && m.reviewFronts.includes(front));
  return hasDedicated ? member.reviewFronts.includes(front) : true;
}

export function reviewersFor(front: string | null, all: MemberInfo[]): MemberInfo[] {
  return all.filter((m) => canReview(m, front, all));
}
