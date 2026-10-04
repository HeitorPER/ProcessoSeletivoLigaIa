import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '@/lib/ai/types';
import { emptyFields } from '@/lib/activity-fields';
import { reviewSuggestion } from '@/lib/activities/review';
import { createActivity, updateActivity } from '@/lib/activities/service';
import { prisma } from '@/lib/db';
import { buildDigest, digestToFacts, summarizeDigest } from '@/lib/summary/digest';
import type { ActivityFields } from '@/lib/types';
import { resetDb } from './helpers/db';

const NOW = new Date('2026-10-03T15:00:00Z');
const f = (over: Partial<ActivityFields>): ActivityFields => ({ ...emptyFields(), title: 'T', ...over });
let since: Date;

async function seed() {
  await prisma.source.create({ data: { fileId: 'reg', name: 'Ata_registro.xlsx', mimeType: 'x', webUrl: 'https://drive/reg', modifiedAt: new Date(), versionOrHash: 'v1' } });
  await prisma.source.create({ data: { fileId: 'ata03', name: 'Ata_2026-10-03', mimeType: 'x', webUrl: 'https://drive/ata03', modifiedAt: new Date(), versionOrHash: 'd1' } });
  const imp = { origin: 'import' as const, sourceFileId: 'reg' };
  await createActivity(f({ title: 'Preparar carrossel sobre ferramentas', front: 'Growth', dueDate: '2026-10-05', ownerIds: ['U-A'] }), 'system', { ...imp, id: 'ACT-101' });
  await createActivity(f({ title: 'Montar checklist inicial de onboarding', front: 'Operações', dueDate: '2026-10-06', ownerIds: ['U-D'] }), 'system', { ...imp, id: 'ACT-102' });
  await createActivity(f({ title: 'Elaborar briefing de oficina', front: 'Formação', status: 'blocked', blockedReason: 'Sala ainda não confirmada', dueDate: '2026-10-09', ownerIds: ['U-C'] }), 'system', { ...imp, id: 'ACT-103' });
  await createActivity(f({ title: 'Revisar fluxo de solicitação de materiais', front: 'Operações', dueDate: '2026-10-11', ownerIds: ['U-A', 'U-D'] }), 'system', { ...imp, id: 'ACT-104' });
  await new Promise((r) => setTimeout(r, 15));
  since = new Date();
  await new Promise((r) => setTimeout(r, 15));
}
const suggest = (over: Record<string, unknown> = {}) =>
  prisma.suggestion.create({
    data: {
      sourceFileId: 'ata03', sourceVersion: 'd1', kind: 'update', targetActivityId: 'ACT-101', front: 'Growth',
      proposedFields: JSON.stringify({ dueDate: '2026-10-07' }), currentSnapshot: JSON.stringify({ dueDate: '2026-10-05' }),
      evidence: 'mudou de 2026-10-05 para **2026-10-07**', reason: 'Ata alterou o prazo', dedupeKey: Math.random().toString(36), ...over,
    },
  });

describe('o que mudou para mim', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('proposta pendente afeta Ana e não Davi', async () => {
    await suggest();
    const ana = await buildDigest('U-A', since, NOW);
    const davi = await buildDigest('U-D', since, NOW);
    expect(ana.pending).toHaveLength(1);
    expect(ana.pending[0].detail).toContain('prazo: 05/10/2026 → 07/10/2026');
    expect(ana.pending[0].links.map((l) => l.href)).toEqual(expect.arrayContaining(['/sugestoes#' + (await prisma.suggestion.findFirst())!.id, 'https://drive/ata03']));
    expect(davi.pending).toHaveLength(0);
    expect(davi.nothingChanged).toBe(true);
  });

  it('proposta pendente compara com o valor oficial de agora, não com a foto do momento da sugestão', async () => {
    await suggest();
    await updateActivity('ACT-101', { dueDate: '2026-10-06' }, 'U-A');
    const ana = await buildDigest('U-A', since, NOW);
    expect(ana.pending).toHaveLength(1);
    expect(ana.pending[0].detail).toContain('prazo: 06/10/2026 → 07/10/2026');
  });

  it('após aprovação, Ana vê mudança confirmada com fonte; Davi não', async () => {
    const s = await suggest();
    await reviewSuggestion(s.id, 'U-B', { action: 'accept' });
    const ana = await buildDigest('U-A', since, NOW);
    expect(ana.confirmed).toHaveLength(1);
    expect(ana.confirmed[0]).toMatchObject({ title: 'ACT-101 · Preparar carrossel sobre ferramentas', tag: 'Bruno' });
    expect(ana.confirmed[0].detail).toContain('prazo: 05/10/2026 → 07/10/2026');
    expect(ana.confirmed[0].links.some((l) => l.href === 'https://drive/ata03' && l.external)).toBe(true);
    expect(ana.pending).toHaveLength(0);
    expect((await buildDigest('U-D', since, NOW)).confirmed).toHaveLength(0);
  });

  it('mudança na atividade compartilhada aparece para os dois', async () => {
    await updateActivity('ACT-104', { nextStep: 'Mapear etapas atuais' }, 'U-A');
    expect((await buildDigest('U-A', since, NOW)).confirmed).toHaveLength(1);
    expect((await buildDigest('U-D', since, NOW)).confirmed).toHaveLength(1);
  });

  it('prazos próximos e bloqueios', async () => {
    expect((await buildDigest('U-A', since, NOW)).deadlines.map((d) => d.key)).toEqual(['deadline-ACT-101']);
    expect((await buildDigest('U-D', since, NOW)).deadlines.map((d) => d.key)).toEqual(['deadline-ACT-102']);
    const carla = await buildDigest('U-C', since, NOW);
    expect(carla.deadlines[0].detail).toContain('Sala ainda não confirmada');
  });

  it('incertezas: fonte indisponível e conflito de fonte', async () => {
    await prisma.source.update({ where: { fileId: 'reg' }, data: { syncStatus: 'unavailable' } });
    await suggest({ kind: 'source_conflict', targetActivityId: null, front: null, proposedFields: '{}', currentSnapshot: null, evidence: 'Planilha "Ata - copia vazia.xlsx"' });
    const davi = await buildDigest('U-D', since, NOW);
    expect(davi.uncertain.some((u) => u.detail.includes('indisponível'))).toBe(true);
    expect(davi.uncertain.some((u) => u.title.includes('Conflito de fonte'))).toBe(true);
  });

  it('resumo por IA recebe só fatos estruturados; falha ou nada novo → null', async () => {
    await suggest();
    const d = await buildDigest('U-A', since, NOW);
    const facts = digestToFacts(d, 'Ana');
    expect(facts).toContain('PROPOSTO');
    expect(facts).toContain('ACT-101');
    const summarize = vi.fn().mockResolvedValue('Há uma proposta de novo prazo para ACT-101.');
    const provider: AIProvider = { name: 'fake', extract: async () => [], summarize };
    expect(await summarizeDigest(d, 'Ana', provider)).toBe('Há uma proposta de novo prazo para ACT-101.');
    expect(summarize).toHaveBeenCalledWith(facts);
    expect(await summarizeDigest(d, 'Ana', { ...provider, summarize: async () => { throw new Error('fora do ar'); } })).toBeNull();
    const empty = await buildDigest('U-C', new Date(), new Date('2026-09-01T12:00:00Z'));
    const spy = vi.fn();
    expect(await summarizeDigest(empty, 'Carla', { ...provider, summarize: spy })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
