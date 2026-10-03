import { beforeEach, describe, expect, it } from 'vitest';
import { emptyFields } from '@/lib/activity-fields';
import { reviewSuggestion } from '@/lib/activities/review';
import { createActivity } from '@/lib/activities/service';
import { prisma } from '@/lib/db';
import { loadMembers } from '@/lib/members';
import { listDiscarded, listSuggestions } from '@/lib/suggestions/queries';
import { resetDb } from './helpers/db';

async function seed() {
  await prisma.source.create({ data: { fileId: 'ata03', name: 'Ata_2026-10-03', mimeType: 'x', webUrl: 'https://drive/ata03', modifiedAt: new Date('2026-10-03T12:00:00Z'), versionOrHash: 'd1', meta: JSON.stringify({ meetingDate: '2026-10-03' }) } });
  await createActivity({ ...emptyFields(), title: 'Preparar carrossel sobre ferramentas', front: 'Growth', dueDate: '2026-10-05', ownerIds: ['U-A'] }, 'system', { origin: 'import', id: 'ACT-101' });
  return prisma.suggestion.create({
    data: {
      sourceFileId: 'ata03', sourceVersion: 'd1', kind: 'update', targetActivityId: 'ACT-101', front: 'Growth',
      proposedFields: JSON.stringify({ dueDate: '2026-10-07' }), currentSnapshot: JSON.stringify({ dueDate: '2026-10-05' }),
      evidence: 'mudou de 2026-10-05 para **2026-10-07**', evidenceLocator: 'Mudança confirmada na reunião', reason: 'Ata alterou o prazo',
      uncertainties: JSON.stringify(['Confirmar com Bruno']), dedupeKey: 'k1',
    },
  });
}

describe('listSuggestions', () => {
  beforeEach(resetDb);
  it('pendentes com permissão por frente e dados da fonte', async () => {
    await seed();
    const members = await loadMembers();
    const bruno = members.find((m) => m.id === 'U-B')!;
    const carla = members.find((m) => m.id === 'U-C')!;
    const [v] = await listSuggestions('pending', bruno);
    expect(v).toMatchObject({ kind: 'update', targetTitle: 'Preparar carrossel sobre ferramentas', canReview: true, reviewerNames: ['Bruno'], uncertainties: ['Confirmar com Bruno'] });
    expect(v.source).toMatchObject({ name: 'Ata_2026-10-03', documentDate: '2026-10-03' });
    expect(v.currentSnapshot).toEqual({ dueDate: '2026-10-05' });
    expect((await listSuggestions('pending', carla))[0].canReview).toBe(false);
  });
  it('revisadas trazem revisor e resultado', async () => {
    const s = await seed();
    await reviewSuggestion(s.id, 'U-B', { action: 'accept' });
    const [v] = await listSuggestions('reviewed', (await loadMembers())[0]);
    expect(v).toMatchObject({ reviewStatus: 'accepted', reviewerName: 'Bruno', resultActivityId: 'ACT-101' });
    expect(await listSuggestions('pending', (await loadMembers())[0])).toHaveLength(0);
  });
  it('trechos descartados com fonte', async () => {
    await seed();
    await prisma.discardedItem.create({ data: { sourceFileId: 'ata03', sourceVersion: 'd1', excerpt: 'Talvez possamos…', reason: 'Hipótese' } });
    expect(await listDiscarded()).toEqual([expect.objectContaining({ excerpt: 'Talvez possamos…', sourceName: 'Ata_2026-10-03', sourceUrl: 'https://drive/ata03' })]);
  });
});
