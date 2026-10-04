import { beforeEach, describe, expect, it } from 'vitest';
import { emptyFields } from '@/lib/activity-fields';
import { reviewSuggestion } from '@/lib/activities/review';
import { createActivity, updateActivity } from '@/lib/activities/service';
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
  it('pendente mostra o valor oficial atual (não a foto do momento da sugestão)', async () => {
    const s = await seed();
    await prisma.suggestion.update({ where: { id: s.id }, data: { proposedFields: JSON.stringify({ dueDate: '2026-10-07', ownerIds: ['U-A', 'U-B'] }), currentSnapshot: JSON.stringify({ dueDate: '2026-10-05', ownerIds: ['U-A'] }) } });
    await updateActivity('ACT-101', { dueDate: '2026-10-06', ownerIds: ['U-D'] }, 'U-A');
    const [v] = await listSuggestions('pending', (await loadMembers())[0]);
    expect(v.currentSnapshot).toEqual({ dueDate: '2026-10-06', ownerIds: ['U-D'] });
  });
  it('revisada mantém a foto guardada no momento da sugestão', async () => {
    const s = await seed();
    await reviewSuggestion(s.id, 'U-B', { action: 'reject', note: 'Prazo mantido' });
    await updateActivity('ACT-101', { dueDate: '2026-10-06' }, 'U-A');
    const [v] = await listSuggestions('reviewed', (await loadMembers())[0]);
    expect(v.currentSnapshot).toEqual({ dueDate: '2026-10-05' });
  });
  it('conflito de planilha que saiu da pasta continua pendente, com aviso e só o descarte liberado', async () => {
    await prisma.source.create({ data: { fileId: 'copia', name: 'Ata - copia vazia.xlsx', mimeType: 'x', webUrl: 'https://drive/copia', modifiedAt: new Date('2026-10-04T12:00:00Z'), versionOrHash: 'h1', kind: 'unauthorized_sheet', syncStatus: 'unavailable', statusReason: 'Arquivo enviado para a lixeira' } });
    await prisma.source.create({ data: { fileId: 'copia2', name: 'Ata - copia vazia.xlsx', mimeType: 'x', webUrl: 'https://drive/copia2', modifiedAt: new Date('2026-10-04T12:00:00Z'), versionOrHash: 'h2', kind: 'unauthorized_sheet', extractedText: 'Atividades: ID, Título' } });
    for (const fileId of ['copia', 'copia2']) {
      await prisma.suggestion.create({ data: { sourceFileId: fileId, sourceVersion: 'h', kind: 'source_conflict', evidence: 'planilha homônima', reason: 'conflito', dedupeKey: `c-${fileId}` } });
    }
    const views = await listSuggestions('pending', (await loadMembers()).find((m) => m.id === 'U-B')!);
    const gone = views.find((v) => v.source.fileId === 'copia')!;
    const present = views.find((v) => v.source.fileId === 'copia2')!;
    expect(gone).toMatchObject({ reviewStatus: 'pending', canReview: true, analysisBlockedReason: 'Arquivo enviado para a lixeira' });
    expect(present.analysisBlockedReason).toBeNull();
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
