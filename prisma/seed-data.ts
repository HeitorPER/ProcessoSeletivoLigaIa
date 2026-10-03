import type { PrismaClient } from '@/generated/prisma/client';
import type { MemberInfo } from '@/lib/types';

export const MEMBERS: MemberInfo[] = [
  { id: 'U-A', displayName: 'Ana', front: 'Growth', role: 'member', reviewFronts: [] },
  { id: 'U-B', displayName: 'Bruno', front: 'Growth', role: 'reviewer', reviewFronts: ['Growth'] },
  { id: 'U-C', displayName: 'Carla', front: 'Formação', role: 'reviewer', reviewFronts: ['Formação'] },
  { id: 'U-D', displayName: 'Davi', front: 'Operações', role: 'member', reviewFronts: [] },
];

export async function seedBase(client: PrismaClient): Promise<void> {
  for (const m of MEMBERS) {
    const data = { displayName: m.displayName, front: m.front, role: m.role, reviewFronts: JSON.stringify(m.reviewFronts) };
    await client.member.upsert({ where: { id: m.id }, update: data, create: { id: m.id, ...data } });
  }
  await client.syncState.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}
