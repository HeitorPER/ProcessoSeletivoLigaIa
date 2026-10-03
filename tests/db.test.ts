import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { resetDb } from './helpers/db';

describe('banco de teste', () => {
  beforeEach(resetDb);
  it('tem os 4 membros fictícios e o estado de sincronização', async () => {
    const members = await prisma.member.findMany({ orderBy: { id: 'asc' } });
    expect(members.map((m) => m.displayName)).toEqual(['Ana', 'Bruno', 'Carla', 'Davi']);
    expect(await prisma.syncState.findUnique({ where: { id: 1 } })).not.toBeNull();
  });
});
