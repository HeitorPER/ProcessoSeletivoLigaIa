import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { emptyFields } from '@/lib/activity-fields';
import { describeChanges } from '@/lib/activities/format';
import { getActivityDetail, listActivities } from '@/lib/activities/queries';
import { reviewSuggestion } from '@/lib/activities/review';
import { createActivity, updateActivity, ValidationError } from '@/lib/activities/service';
import { canReview, loadMembers } from '@/lib/members';
import type { ActivityFields } from '@/lib/types';
import { resetDb } from './helpers/db';

const f = (over: Partial<ActivityFields>): ActivityFields => ({ ...emptyFields(), title: 'Tarefa', ...over });

async function seedRegistry() {
  await prisma.source.create({ data: { fileId: 'reg', name: 'Ata_registro.xlsx', mimeType: 'x', webUrl: 'https://drive/reg', modifiedAt: new Date(), versionOrHash: 'v1', kind: 'activity_registry' } });
  await prisma.source.create({ data: { fileId: 'ata03', name: 'Ata_2026-10-03', mimeType: 'x', webUrl: 'https://drive/ata03', modifiedAt: new Date(), versionOrHash: 'd1', kind: 'minutes' } });
  const imp = { origin: 'import' as const, sourceFileId: 'reg', reason: 'Importação inicial' };
  await createActivity(f({ title: 'Preparar carrossel sobre ferramentas', front: 'Growth', status: 'in_progress', dueDate: '2026-10-05', nextStep: 'Preparar roteiro e selecionar exemplos', ownerIds: ['U-A'] }), 'system', { ...imp, id: 'ACT-101' });
  await createActivity(f({ title: 'Montar checklist inicial de onboarding', front: 'Operações', dueDate: '2026-10-06', ownerIds: ['U-D'] }), 'system', { ...imp, id: 'ACT-102' });
  await createActivity(f({ title: 'Elaborar briefing de oficina', front: 'Formação', status: 'blocked', blockedReason: 'Sala ainda não confirmada', dueDate: '2026-10-09', ownerIds: ['U-C'] }), 'system', { ...imp, id: 'ACT-103' });
  await createActivity(f({ title: 'Revisar fluxo de solicitação de materiais', front: 'Operações', dueDate: '2026-10-11', ownerIds: ['U-A', 'U-D'] }), 'system', { ...imp, id: 'ACT-104' });
}

async function suggestion(over: Record<string, unknown>) {
  return prisma.suggestion.create({
    data: {
      sourceFileId: 'ata03', sourceVersion: 'd1', kind: 'update', targetActivityId: 'ACT-101',
      proposedFields: JSON.stringify({ dueDate: '2026-10-07' }), evidence: 'mudou de 2026-10-05 para 2026-10-07',
      reason: 'Ata alterou o prazo', front: 'Growth', dedupeKey: Math.random().toString(36), ...over,
    },
  });
}

describe('membros e permissão de revisão', () => {
  beforeEach(resetDb);
  it('Bruno revisa Growth; Carla revisa Formação; Operações/sem frente qualquer revisor; Ana nunca', async () => {
    const all = await loadMembers();
    const by = (n: string) => all.find((m) => m.displayName === n)!;
    expect(canReview(by('Bruno'), 'Growth', all)).toBe(true);
    expect(canReview(by('Carla'), 'Growth', all)).toBe(false);
    expect(canReview(by('Carla'), 'Formação', all)).toBe(true);
    expect(canReview(by('Carla'), 'Operações', all)).toBe(true);
    expect(canReview(by('Bruno'), null, all)).toBe(true);
    expect(canReview(by('Ana'), null, all)).toBe(false);
  });
});

describe('criar e editar', () => {
  beforeEach(async () => {
    await resetDb();
    await seedRegistry();
  });
  it('importação preserva dois responsáveis e atividade bloqueada', async () => {
    const all = await listActivities({ status: 'all' }, '2026-10-03');
    expect(all.map((a) => a.id)).toEqual(['ACT-101', 'ACT-102', 'ACT-103', 'ACT-104']);
    expect(all.find((a) => a.id === 'ACT-104')!.owners.map((o) => o.displayName)).toEqual(['Ana', 'Davi']);
    expect(all.find((a) => a.id === 'ACT-103')!.status).toBe('blocked');
    expect(all[0].sources[0]).toMatchObject({ name: 'Ata_registro.xlsx', relationType: 'imported_from' });
  });
  it('criação manual gera ID ACT-M-001, autor e evento', async () => {
    const a = await createActivity(f({ title: 'Nova tarefa', front: 'Growth', ownerIds: ['U-A'] }), 'U-B', { origin: 'manual' });
    expect(a.id).toBe('ACT-M-001');
    const b = await createActivity(f({ title: 'Outra' }), 'U-B', { origin: 'manual' });
    expect(b.id).toBe('ACT-M-002');
    expect(await prisma.activity.findUnique({ where: { id: 'ACT-M-001' } })).toMatchObject({ createdBy: 'U-B', origin: 'manual' });
    expect(await prisma.activityEvent.findFirst({ where: { activityId: 'ACT-M-001' } })).toMatchObject({ actorId: 'U-B', type: 'create' });
  });
  it('validação rejeita título vazio, data inválida e responsável inexistente', async () => {
    await expect(createActivity(f({ title: ' ', dueDate: '07/10/2026', ownerIds: ['U-Z'] }), 'U-A', { origin: 'manual' })).rejects.toBeInstanceOf(ValidationError);
  });
  it('edição registra só campos alterados, com antes/depois', async () => {
    const r = await updateActivity('ACT-101', { dueDate: '2026-10-08', title: 'Preparar carrossel sobre ferramentas' }, 'U-A', { reason: 'Ajuste combinado' });
    expect(r.changedFields).toEqual(['dueDate']);
    const ev = await prisma.activityEvent.findFirst({ where: { activityId: 'ACT-101', type: 'update' } });
    expect(JSON.parse(ev!.before!)).toEqual({ dueDate: '2026-10-05' });
    expect(JSON.parse(ev!.after!)).toEqual({ dueDate: '2026-10-08' });
    expect(ev!.reason).toBe('Ajuste combinado');
  });
  it('edição sem mudança não gera evento', async () => {
    const r = await updateActivity('ACT-101', { dueDate: '2026-10-05' }, 'U-A');
    expect(r.changedFields).toEqual([]);
    expect(await prisma.activityEvent.count({ where: { activityId: 'ACT-101' } })).toBe(1);
  });
  it('troca de responsáveis e mudança de estado', async () => {
    await updateActivity('ACT-102', { ownerIds: ['U-D', 'U-A'] }, 'U-B');
    await updateActivity('ACT-102', { status: 'done' }, 'U-D');
    const d = await getActivityDetail('ACT-102');
    expect(d!.owners.map((o) => o.id)).toEqual(['U-A', 'U-D']);
    expect(d!.status).toBe('done');
    expect(d!.events[0]).toMatchObject({ type: 'status', actorName: 'Davi' });
    expect(d!.events[0].changes).toEqual(['estado: A fazer → Concluída']);
  });
  it('describeChanges formata datas e responsáveis', async () => {
    const members = await loadMembers();
    expect(describeChanges({ dueDate: '2026-10-05', ownerIds: ['U-A'] }, { dueDate: null, ownerIds: ['U-A', 'U-D'] }, ['dueDate', 'ownerIds'], members)).toEqual([
      'prazo: 05/10/2026 → a definir',
      'responsáveis: Ana → Ana, Davi',
    ]);
  });
});

describe('revisão de sugestões', () => {
  beforeEach(async () => {
    await resetDb();
    await seedRegistry();
  });
  it('aceitar atualização altera o oficial, grava evento e referência', async () => {
    const s = await suggestion({});
    const r = await reviewSuggestion(s.id, 'U-B', { action: 'accept' });
    expect(r).toMatchObject({ ok: true, status: 'accepted', activityId: 'ACT-101' });
    const d = await getActivityDetail('ACT-101');
    expect(d!.dueDate).toBe('2026-10-07');
    expect(d!.events[0]).toMatchObject({ type: 'suggestion_applied', actorName: 'Bruno' });
    expect(d!.events[0].source?.name).toBe('Ata_2026-10-03');
    expect(d!.sources.map((x) => x.name).sort()).toEqual(['Ata_2026-10-03', 'Ata_registro.xlsx']);
  });
  it('aceitar duas vezes é idempotente', async () => {
    const s = await suggestion({});
    await reviewSuggestion(s.id, 'U-B', { action: 'accept' });
    const again = await reviewSuggestion(s.id, 'U-B', { action: 'accept' });
    expect(again).toMatchObject({ ok: false, error: 'already_reviewed' });
    expect(await prisma.activityEvent.count({ where: { activityId: 'ACT-101', type: 'suggestion_applied' } })).toBe(1);
  });
  it('revisor de outra frente é bloqueado', async () => {
    const s = await suggestion({});
    expect(await reviewSuggestion(s.id, 'U-C', { action: 'accept' })).toMatchObject({ ok: false, error: 'forbidden' });
    expect(await reviewSuggestion(s.id, 'U-A', { action: 'accept' })).toMatchObject({ ok: false, error: 'forbidden' });
  });
  it('rejeitar exige motivo e não altera o oficial', async () => {
    const s = await suggestion({});
    expect(await reviewSuggestion(s.id, 'U-B', { action: 'reject', note: ' ' })).toMatchObject({ ok: false, error: 'invalid' });
    expect(await reviewSuggestion(s.id, 'U-B', { action: 'reject', note: 'Prazo não foi combinado' })).toMatchObject({ ok: true, status: 'rejected' });
    expect((await getActivityDetail('ACT-101'))!.dueDate).toBe('2026-10-05');
    expect((await prisma.suggestion.findUnique({ where: { id: s.id } }))!.reviewNote).toBe('Prazo não foi combinado');
  });
  it('ajustar e aceitar uma criação cria atividade com os campos ajustados', async () => {
    const s = await suggestion({ kind: 'create', targetActivityId: null, front: 'Formação', proposedFields: JSON.stringify({ title: 'Revisar pauta', ownerIds: ['U-C'], dueDate: '2026-10-10', status: 'todo', front: 'Formação' }) });
    const r = await reviewSuggestion(s.id, 'U-C', { action: 'adjust', fields: { title: 'Revisar pauta da primeira oficina' } });
    expect(r).toMatchObject({ ok: true, status: 'adjusted', activityId: 'ACT-M-001' });
    const d = await getActivityDetail('ACT-M-001');
    expect(d).toMatchObject({ title: 'Revisar pauta da primeira oficina', dueDate: '2026-10-10', origin: 'suggestion' });
    expect(d!.sources[0]).toMatchObject({ name: 'Ata_2026-10-03', relationType: 'created_by' });
  });
  it('criação com proposedId usa o ID da planilha', async () => {
    const s = await suggestion({ kind: 'create', targetActivityId: null, proposedId: 'ACT-105', front: 'Growth', proposedFields: JSON.stringify({ title: 'Nova da planilha', ownerIds: ['U-A'], status: 'todo', front: 'Growth' }) });
    expect(await reviewSuggestion(s.id, 'U-B', { action: 'accept' })).toMatchObject({ ok: true, activityId: 'ACT-105' });
  });
  it('conflito de fonte: aceitar pede análise; rejeitar descarta', async () => {
    const s1 = await suggestion({ kind: 'source_conflict', targetActivityId: null, front: null, proposedFields: '{}' });
    await prisma.source.update({ where: { fileId: 'ata03' }, data: { extractedText: 'texto em cache' } }); // aceitar exige o texto da planilha
    expect(await reviewSuggestion(s1.id, 'U-B', { action: 'accept' })).toMatchObject({ ok: true, followUp: 'analyze_sheet', sourceFileId: 'ata03' });
    const s2 = await suggestion({ kind: 'source_conflict', targetActivityId: null, front: null, proposedFields: '{}' });
    expect(await reviewSuggestion(s2.id, 'U-C', { action: 'reject', note: 'Planilha vazia sem autoridade' })).toMatchObject({ ok: true, status: 'rejected', followUp: null });
    expect(await prisma.activity.count()).toBe(4);
  });
});

describe('consultas', () => {
  beforeEach(async () => {
    await resetDb();
    await seedRegistry();
  });
  it('"minhas" de Ana e Davi; ACT-104 aparece uma vez para cada', async () => {
    const ana = await listActivities({ ownerId: 'U-A', status: 'open' }, '2026-10-03');
    const davi = await listActivities({ ownerId: 'U-D', status: 'open' }, '2026-10-03');
    expect(ana.map((a) => a.id)).toEqual(['ACT-101', 'ACT-104']);
    expect(davi.map((a) => a.id)).toEqual(['ACT-102', 'ACT-104']);
  });
  it('filtros de frente, estado e prazo', async () => {
    await createActivity(f({ title: 'Sem prazo', front: 'Growth', ownerIds: ['U-A'] }), 'U-A', { origin: 'manual' });
    expect((await listActivities({ front: 'Operações', status: 'all' }, '2026-10-03')).map((a) => a.id)).toEqual(['ACT-102', 'ACT-104']);
    expect((await listActivities({ status: 'blocked' }, '2026-10-03')).map((a) => a.id)).toEqual(['ACT-103']);
    expect((await listActivities({ due: 'none', status: 'all' }, '2026-10-03')).map((a) => a.id)).toEqual(['ACT-M-001']);
    expect((await listActivities({ due: 'overdue', status: 'all' }, '2026-10-07')).map((a) => a.id)).toEqual(['ACT-101', 'ACT-102']);
    expect((await listActivities({ due: 'week', status: 'all' }, '2026-10-03')).map((a) => a.id)).toEqual(['ACT-101', 'ACT-102', 'ACT-103']);
  });
  it('ordenação: prazo crescente, sem prazo por último', async () => {
    await createActivity(f({ title: 'Sem prazo' }), 'U-A', { origin: 'manual' });
    expect((await listActivities({ status: 'all' }, '2026-10-03')).map((a) => a.id).at(-1)).toBe('ACT-M-001');
  });
  it('indica sugestão pendente e fonte indisponível', async () => {
    await suggestion({});
    await prisma.source.update({ where: { fileId: 'reg' }, data: { syncStatus: 'unavailable' } });
    const a = (await listActivities({ status: 'all' }, '2026-10-03')).find((x) => x.id === 'ACT-101')!;
    expect(a.pendingSuggestions).toBe(1);
    expect(a.hasStaleSource).toBe(true);
    expect(a.staleReason).toBe('unavailable');
  });
  it('distingue fonte com erro de leitura de fonte indisponível', async () => {
    const find = async () => (await listActivities({ status: 'all' }, '2026-10-03')).find((x) => x.id === 'ACT-101')!;
    expect(await find()).toMatchObject({ hasStaleSource: false, staleReason: null });
    await prisma.source.update({ where: { fileId: 'reg' }, data: { syncStatus: 'error' } });
    expect(await find()).toMatchObject({ hasStaleSource: true, staleReason: 'error' });
  });
});
