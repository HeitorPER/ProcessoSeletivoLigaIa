import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRuleBasedProvider } from '@/lib/ai/rules';
import type { AIProvider } from '@/lib/ai/types';
import { reviewSuggestion } from '@/lib/activities/review';
import { updateActivity } from '@/lib/activities/service';
import { prisma } from '@/lib/db';
import { parseXlsx } from '@/lib/extract/xlsx';
import { analyzeUnauthorizedSheet, ingestExtracted, ingestSource, markSourceUnavailable, restoreExtractedText } from '@/lib/ingest';
import type { FetchedContent, SourceMeta } from '@/lib/types';
import { resetDb } from './helpers/db';

const fx = (p: string) => path.join(__dirname, 'fixtures', p);
const provider = createRuleBasedProvider();
const ctx = { provider };
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const metaFor = (name: string, over: Partial<SourceMeta> = {}): SourceMeta => ({
  fileId: name, name, mimeType: name.endsWith('.xlsx') ? XLSX : 'text/markdown', webUrl: `https://drive.google.com/file/d/${name}/view`,
  modifiedAt: new Date('2026-10-03T12:00:00Z'), versionOrHash: 'v1', path: 'LIA case teste', parentIds: ['root'], ...over,
});
const md = (p: string): FetchedContent => ({ format: 'markdown', text: readFileSync(fx(p), 'utf8') });
const xlsx = (p: string): FetchedContent => ({ format: 'xlsx', buffer: readFileSync(fx(p)) });
const ATA03 = readFileSync(fx('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-03.md'), 'utf8');

async function initialLoad() {
  await ingestSource(metaFor('INDEX.md'), md('01_CARGA_INICIAL/INDEX.md'), ctx);
  await ingestSource(metaFor('Ata_registro.xlsx'), xlsx('01_CARGA_INICIAL/Ata_registro.xlsx'), ctx);
  for (const f of ['ESTADO-ATUAL.md', 'GUIA_INICIAL.md', 'PLANO_EDITORIAL_ANTIGO.md', 'Ata_2026-10-01.md']) {
    await ingestSource(metaFor(f), md(`01_CARGA_INICIAL/${f}`), ctx);
  }
}
const pending = () => prisma.suggestion.findMany({ where: { reviewStatus: 'pending' } });

describe('carga inicial', () => {
  beforeEach(async () => {
    await resetDb();
    await initialLoad();
  });
  it('importa as 4 atividades da fonte apontada pelo INDEX', async () => {
    const acts = await prisma.activity.findMany({ include: { owners: true }, orderBy: { id: 'asc' } });
    expect(acts.map((a) => a.id)).toEqual(['ACT-101', 'ACT-102', 'ACT-103', 'ACT-104']);
    expect(acts[3].owners.map((o) => o.memberId).sort()).toEqual(['U-A', 'U-D']);
    expect(acts[2]).toMatchObject({ status: 'blocked', blockedReason: 'Sala ainda não confirmada', dueDate: '2026-10-09', front: 'Formação' });
    expect(acts[0]).toMatchObject({ dueDate: '2026-10-05', nextStep: 'Preparar roteiro e selecionar exemplos', origin: 'import', createdBy: 'system' });
    const state = await prisma.syncState.findUnique({ where: { id: 1 } });
    expect(state).toMatchObject({ authorityFileId: 'Ata_registro.xlsx', authoritySheet: 'Atividades', authorityIndexFileId: 'INDEX.md' });
    expect(state!.initialImportAt).not.toBeNull();
  });
  it('classifica as fontes e não cria sugestões na carga inicial', async () => {
    const kinds = Object.fromEntries((await prisma.source.findMany()).map((s) => [s.name, s.kind]));
    expect(kinds).toEqual({
      'INDEX.md': 'direction', 'Ata_registro.xlsx': 'activity_registry', 'ESTADO-ATUAL.md': 'direction',
      'GUIA_INICIAL.md': 'direction', 'PLANO_EDITORIAL_ANTIGO.md': 'deprecated', 'Ata_2026-10-01.md': 'minutes',
    });
    expect(await prisma.suggestion.count()).toBe(0);
    const ata01 = await prisma.source.findUnique({ where: { fileId: 'Ata_2026-10-01.md' } });
    expect(ata01!.statusReason).toContain('origem');
    expect(await prisma.reference.count({ where: { fileId: 'Ata_2026-10-01.md', relationType: 'created_by' } })).toBe(4);
  });
});

describe('atas novas e editadas', () => {
  beforeEach(async () => {
    await resetDb();
    await initialLoad();
  });
  it('ata 03/10 gera uma sugestão de atualização e não altera o oficial', async () => {
    const out = await ingestSource(metaFor('Ata_2026-10-03', { fileId: 'ata03' }), md('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-03.md'), ctx);
    expect(out).toMatchObject({ status: 'processed', kind: 'minutes', suggestionsCreated: 1 });
    const [s] = await pending();
    expect(s).toMatchObject({ kind: 'update', targetActivityId: 'ACT-101', front: 'Growth' });
    expect(JSON.parse(s.proposedFields)).toMatchObject({ dueDate: '2026-10-07' });
    expect(JSON.parse(s.currentSnapshot!)).toMatchObject({ dueDate: '2026-10-05' });
    expect((await prisma.activity.findUnique({ where: { id: 'ACT-101' } }))!.dueDate).toBe('2026-10-05');
  });
  it('o mesmo evento duas vezes não duplica sugestões', async () => {
    const m = metaFor('Ata_2026-10-03', { fileId: 'ata03' });
    await ingestSource(m, md('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-03.md'), ctx);
    await ingestSource(m, md('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-03.md'), ctx);
    expect(await prisma.suggestion.count()).toBe(1);
    expect(await prisma.source.count({ where: { fileId: 'ata03' } })).toBe(1);
  });
  it('edição da ata substitui a sugestão pendente da versão antiga', async () => {
    await ingestSource(metaFor('Ata_2026-10-03', { fileId: 'ata03' }), md('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-03.md'), ctx);
    await ingestSource(metaFor('Ata_2026-10-03', { fileId: 'ata03', versionOrHash: 'v2' }), { format: 'markdown', text: ATA03.replace('**2026-10-07**', '**2026-10-08**') }, ctx);
    const all = await prisma.suggestion.findMany({ orderBy: { createdAt: 'asc' } });
    expect(all.map((s) => s.reviewStatus)).toEqual(['superseded', 'pending']);
    expect(JSON.parse(all[1].proposedFields).dueDate).toBe('2026-10-08');
  });
  it('reprocessar ata após aceite não recria sugestão', async () => {
    await ingestSource(metaFor('Ata_2026-10-03', { fileId: 'ata03' }), md('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-03.md'), ctx);
    const [s] = await pending();
    expect(await reviewSuggestion(s.id, 'U-B', { action: 'accept' })).toMatchObject({ ok: true });
    await ingestSource(metaFor('Ata_2026-10-03', { fileId: 'ata03', versionOrHash: 'v2' }), { format: 'markdown', text: `${ATA03}\n` }, ctx);
    expect(await pending()).toHaveLength(0);
  });
  it('ata 04/10 gera criação para Carla e descarta a ideia "talvez"', async () => {
    await ingestSource(metaFor('Ata_2026-10-04.md'), md('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-04.md'), ctx);
    const [s] = await pending();
    expect(s).toMatchObject({ kind: 'create', front: 'Formação' });
    expect(JSON.parse(s.proposedFields)).toMatchObject({ ownerIds: ['U-C'], dueDate: '2026-10-10' });
    const discarded = await prisma.discardedItem.findMany({ where: { sourceFileId: 'Ata_2026-10-04.md' } });
    expect(discarded.some((d) => d.excerpt.includes('Talvez'))).toBe(true);
    expect(await prisma.activity.count()).toBe(4);
  });
  it('falha da IA marca erro e permite nova tentativa (nunca "sem atividades")', async () => {
    const failing: AIProvider = { name: 'falha', extract: async () => { throw new Error('timeout'); }, summarize: async () => null };
    const m = metaFor('Ata_2026-10-03', { fileId: 'ata03' });
    const out = await ingestSource(m, md('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-03.md'), { provider: failing });
    expect(out.status).toBe('error');
    const src = await prisma.source.findUnique({ where: { fileId: 'ata03' } });
    expect(src).toMatchObject({ syncStatus: 'error', processedVersion: null });
    expect(src!.statusReason).toContain('Análise da ata falhou');
    expect((await ingestSource(m, md('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-03.md'), ctx)).status).toBe('processed');
  });
});

describe('autoridade e conflitos', () => {
  beforeEach(async () => {
    await resetDb();
    await initialLoad();
  });
  it('planilha vazia homônima não apaga nada e vira conflito visível', async () => {
    const m = metaFor('Ata - copia vazia.xlsx', { fileId: 'copia' });
    await ingestSource(m, xlsx('03_CONFLITO/Ata - copia vazia.xlsx'), ctx);
    await ingestSource(m, xlsx('03_CONFLITO/Ata - copia vazia.xlsx'), ctx);
    expect(await prisma.activity.count()).toBe(4);
    expect((await prisma.source.findUnique({ where: { fileId: 'copia' } }))!.kind).toBe('unauthorized_sheet');
    const conflicts = await prisma.suggestion.findMany({ where: { kind: 'source_conflict' } });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].uncertainties).toContain('vazia');
    expect(await analyzeUnauthorizedSheet('copia')).toBe(0);
  });
  it('analisar planilha sem texto em cache falha com mensagem clara (nunca "0 sugestões")', async () => {
    await ingestSource(metaFor('Ata_registro.xlsx', { fileId: 'copia-sem-texto' }), xlsx('01_CARGA_INICIAL/Ata_registro.xlsx'), ctx);
    await prisma.source.update({ where: { fileId: 'copia-sem-texto' }, data: { extractedText: null } });
    await expect(analyzeUnauthorizedSheet('copia-sem-texto')).rejects.toThrow('Texto da planilha indisponível — sincronize novamente antes de analisar');
    await ingestSource(metaFor('Ata_registro.xlsx', { fileId: 'copia-sumiu' }), xlsx('01_CARGA_INICIAL/Ata_registro.xlsx'), ctx);
    await markSourceUnavailable('copia-sumiu', 'Arquivo removido');
    await expect(analyzeUnauthorizedSheet('copia-sumiu')).rejects.toThrow('Texto da planilha indisponível');
  });
  it('restoreExtractedText regrava só o texto, sem reclassificar nem reanalisar', async () => {
    await ingestSource(metaFor('Ata_2026-10-03', { fileId: 'ata03' }), md('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-03.md'), ctx);
    await prisma.source.update({ where: { fileId: 'ata03' }, data: { extractedText: null } });
    const before = await prisma.source.findUnique({ where: { fileId: 'ata03' } });
    const out = await restoreExtractedText(metaFor('Ata_2026-10-03', { fileId: 'ata03' }), md('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-03.md'));
    expect(out).toMatchObject({ status: 'processed', kind: 'minutes', suggestionsCreated: 0, authorityChanged: false });
    const after = await prisma.source.findUnique({ where: { fileId: 'ata03' } });
    expect(after).toMatchObject({ syncStatus: 'processed', kind: 'minutes', statusReason: before!.statusReason, processedVersion: 'v1' });
    expect(after!.extractedText).toContain('ACT-101');
    expect(await prisma.suggestion.count()).toBe(1);
    const bad = await restoreExtractedText(metaFor('scan.pdf', { mimeType: 'application/pdf' }), { format: 'pdf', buffer: Buffer.from('xx') });
    expect(bad.status).toBe('error');
    expect((await prisma.source.findUnique({ where: { fileId: 'scan.pdf' } }))!.syncStatus).toBe('error');
  });
  it('cópia com o mesmo nome da fonte vigente (outro fileId) não reimporta', async () => {
    await ingestSource(metaFor('Ata_registro.xlsx', { fileId: 'copia-subpasta' }), xlsx('01_CARGA_INICIAL/Ata_registro.xlsx'), ctx);
    expect((await prisma.source.findUnique({ where: { fileId: 'copia-subpasta' } }))!.kind).toBe('unauthorized_sheet');
    expect(await prisma.activity.count()).toBe(4);
    expect(await prisma.suggestion.count({ where: { kind: 'source_conflict' } })).toBe(1);
  });
  it('edição posterior da planilha vigente vira sugestões (nunca altera direto)', async () => {
    const doc = parseXlsx(readFileSync(fx('01_CARGA_INICIAL/Ata_registro.xlsx')));
    const sheet = doc.sheets.find((s) => s.name === 'Atividades')!;
    const act101 = sheet.rows.find((r) => r.cells.ID === 'ACT-101')!;
    act101.cells.Prazo = '2026-10-09';
    sheet.rows = sheet.rows.filter((r) => r.cells.ID !== 'ACT-102');
    const refs = Object.fromEntries(Object.keys(act101.cellRefs).map((k, i) => [k, `${String.fromCharCode(65 + i)}6`]));
    sheet.rows.push({ rowNumber: 6, cellRefs: refs, cells: { ...act101.cells, ID: 'ACT-105', Atividade: 'Planejar newsletter', 'Responsáveis': 'Ana', Prazo: '2026-10-20', Status: 'A fazer' } });

    await ingestExtracted(metaFor('Ata_registro.xlsx', { versionOrHash: 'v2' }), doc, ctx);
    const sug = await pending();
    const upd = sug.find((s) => s.kind === 'update')!;
    expect(upd.targetActivityId).toBe('ACT-101');
    expect(JSON.parse(upd.proposedFields)).toEqual({ dueDate: '2026-10-09' });
    expect(upd.evidence).toContain('Atividades!D2 = 09/10/2026');
    const crt = sug.find((s) => s.kind === 'create')!;
    expect(crt.proposedId).toBe('ACT-105');
    expect(await prisma.activity.count()).toBe(4);
    expect((await prisma.activity.findUnique({ where: { id: 'ACT-101' } }))!.dueDate).toBe('2026-10-05');
    expect((await prisma.discardedItem.findMany()).some((d) => d.excerpt.startsWith('ACT-102'))).toBe(true);
  });
  it('edição da planilha igual ao que já foi editado na UI não gera sugestão', async () => {
    await updateActivity('ACT-101', { dueDate: '2026-10-09' }, 'U-A');
    const doc = parseXlsx(readFileSync(fx('01_CARGA_INICIAL/Ata_registro.xlsx')));
    doc.sheets[0].rows.find((r) => r.cells.ID === 'ACT-101')!.cells.Prazo = '2026-10-09';
    await ingestExtracted(metaFor('Ata_registro.xlsx', { versionOrHash: 'v2' }), doc, ctx);
    expect(await pending()).toHaveLength(0);
  });
});

describe('formatos e indisponibilidade', () => {
  beforeEach(resetDb);
  it('formato não suportado fica "ignorado" com motivo e versão registrada', async () => {
    const out = await ingestSource(metaFor('foto.png', { mimeType: 'image/png' }), { format: 'unsupported', reason: 'Formato ainda não processado (image/png)' }, ctx);
    expect(out.status).toBe('ignored');
    expect(await prisma.source.findUnique({ where: { fileId: 'foto.png' } })).toMatchObject({ kind: 'unsupported', syncStatus: 'ignored', processedVersion: 'v1' });
  });
  it('arquivo ilegível fica "com erro" (não vazio)', async () => {
    const out = await ingestSource(metaFor('scan.pdf', { mimeType: 'application/pdf' }), { format: 'pdf', buffer: Buffer.from('xx') }, ctx);
    expect(out.status).toBe('error');
    expect((await prisma.source.findUnique({ where: { fileId: 'scan.pdf' } }))!.syncStatus).toBe('error');
  });
  it('markSourceUnavailable apaga o texto em cache', async () => {
    await ingestSource(metaFor('GUIA_INICIAL.md'), md('01_CARGA_INICIAL/GUIA_INICIAL.md'), ctx);
    expect(await markSourceUnavailable('GUIA_INICIAL.md', 'Arquivo removido')).toBe(true);
    expect(await prisma.source.findUnique({ where: { fileId: 'GUIA_INICIAL.md' } })).toMatchObject({ syncStatus: 'unavailable', extractedText: null, statusReason: 'Arquivo removido' });
    expect(await markSourceUnavailable('GUIA_INICIAL.md', 'Arquivo removido')).toBe(false);
  });
});

type Sheet0 = ReturnType<typeof parseXlsx>['sheets'][number];
function registryV(version: string, edit: (sheet: Sheet0) => void) {
  const doc = parseXlsx(readFileSync(fx('01_CARGA_INICIAL/Ata_registro.xlsx')));
  edit(doc.sheets.find((s) => s.name === 'Atividades')!);
  return { meta: metaFor('Ata_registro.xlsx', { versionOrHash: version }), doc };
}
const rowOf = (sheet: Sheet0, id: string) => sheet.rows.find((r) => r.cells.ID === id)!;
const pendingFor = async (id: string) => (await pending()).filter((s) => s.targetActivityId === id);

describe('correções da rodada 1', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('A: ata nova citada como Origem de uma linha criada depois da carga ainda é analisada', async () => {
    await initialLoad();
    const v2 = registryV('v2', (sheet) => {
      const base = rowOf(sheet, 'ACT-101');
      sheet.rows.push({ rowNumber: 6, cellRefs: base.cellRefs, cells: { ...base.cells, ID: 'ACT-105', Atividade: 'Planejar newsletter', 'Responsáveis': 'Ana', Origem: 'Ata_2026-10-04.md' } });
    });
    await ingestExtracted(v2.meta, v2.doc, ctx);
    const out = await ingestSource(metaFor('Ata_2026-10-04.md'), md('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-04.md'), ctx);
    expect(out.suggestionsCreated).toBe(1);
    const creates = await prisma.suggestion.findMany({ where: { kind: 'create', sourceFileId: 'Ata_2026-10-04.md', reviewStatus: 'pending' } });
    expect(creates).toHaveLength(1);
    expect(JSON.parse(creates[0].proposedFields)).toMatchObject({ ownerIds: ['U-C'] });
  });

  it('B: falha da IA na reedição preserva a sugestão antiga; sucesso depois a substitui', async () => {
    const failing: AIProvider = { name: 'falha', extract: async () => { throw new Error('timeout'); }, summarize: async () => null };
    await initialLoad();
    await ingestSource(metaFor('Ata_2026-10-03', { fileId: 'ata03' }), md('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-03.md'), ctx);
    const v2 = metaFor('Ata_2026-10-03', { fileId: 'ata03', versionOrHash: 'v2' });
    const edited: FetchedContent = { format: 'markdown', text: ATA03.replace('**2026-10-07**', '**2026-10-08**') };
    expect((await ingestSource(v2, edited, { provider: failing })).status).toBe('error');
    expect((await prisma.suggestion.findMany()).map((s) => s.reviewStatus)).toEqual(['pending']);
    expect((await prisma.source.findUnique({ where: { fileId: 'ata03' } }))!.syncStatus).toBe('error');
    expect((await ingestSource(v2, edited, ctx)).status).toBe('processed');
    const all = await prisma.suggestion.findMany({ orderBy: { createdAt: 'asc' } });
    expect(all.map((s) => s.reviewStatus)).toEqual(['superseded', 'pending']);
  });

  describe('C: planilha vigente editada várias vezes', () => {
    beforeEach(initialLoad);
    const setPrazo = (value: string) => (sheet: Sheet0) => { rowOf(sheet, 'ACT-101').cells.Prazo = value; };

    it('versão mais recente substitui a pendente anterior', async () => {
      const v2 = registryV('v2', setPrazo('2026-10-09'));
      await ingestExtracted(v2.meta, v2.doc, ctx);
      expect((await pendingFor('ACT-101')).map((s) => JSON.parse(s.proposedFields))).toEqual([{ dueDate: '2026-10-09' }]);
      const v3 = registryV('v3', setPrazo('2026-10-12'));
      await ingestExtracted(v3.meta, v3.doc, ctx);
      expect((await pendingFor('ACT-101')).map((s) => JSON.parse(s.proposedFields))).toEqual([{ dueDate: '2026-10-12' }]);
      expect(await prisma.suggestion.count({ where: { targetActivityId: 'ACT-101', reviewStatus: 'superseded' } })).toBe(1);
    });

    it('voltar ao valor oficial remove a pendência; voltar a uma proposta antiga a reabre', async () => {
      const v2 = registryV('v2', setPrazo('2026-10-09'));
      await ingestExtracted(v2.meta, v2.doc, ctx);
      const v3 = registryV('v3', setPrazo('2026-10-05'));
      await ingestExtracted(v3.meta, v3.doc, ctx);
      expect(await pendingFor('ACT-101')).toHaveLength(0);
      const v4 = registryV('v4', setPrazo('2026-10-09'));
      await ingestExtracted(v4.meta, v4.doc, ctx);
      expect((await pendingFor('ACT-101')).map((s) => JSON.parse(s.proposedFields))).toEqual([{ dueDate: '2026-10-09' }]);
    });

    it('proposta rejeitada não é recriada por versões seguintes', async () => {
      const v2 = registryV('v2', setPrazo('2026-10-09'));
      await ingestExtracted(v2.meta, v2.doc, ctx);
      const [s] = await pendingFor('ACT-101');
      expect(await reviewSuggestion(s.id, 'U-B', { action: 'reject', note: 'Prazo mantido' })).toMatchObject({ ok: true });
      const v3 = registryV('v3', (sheet) => { setPrazo('2026-10-09')(sheet); rowOf(sheet, 'ACT-103').cells['Notas e bloqueios'] = 'Sala confirmada para 09/10'; });
      await ingestExtracted(v3.meta, v3.doc, ctx);
      expect(await pendingFor('ACT-101')).toHaveLength(0);
      expect(await prisma.suggestion.count({ where: { targetActivityId: 'ACT-101' } })).toBe(1);
    });

    it('prazo ilegível não gera proposta de prazo e fica registrado', async () => {
      const v2 = registryV('v2', setPrazo('sexta'));
      await ingestExtracted(v2.meta, v2.doc, ctx);
      expect(await pendingFor('ACT-101')).toHaveLength(0);
      const issues = await prisma.discardedItem.findMany({ where: { sourceFileId: 'Ata_registro.xlsx' } });
      expect(issues.some((d) => d.excerpt.includes('sexta'))).toBe(true);
    });

    it('responsável não reconhecido não gera proposta de limpar responsáveis', async () => {
      const v2 = registryV('v2', (sheet) => { rowOf(sheet, 'ACT-101').cells['Responsáveis'] = 'Fulano'; });
      await ingestExtracted(v2.meta, v2.doc, ctx);
      expect(await pendingFor('ACT-101')).toHaveLength(0);
    });
  });

  describe('rodada 2: linhas adicionadas e removidas depois da importação', () => {
    beforeEach(initialLoad);
    const addRow105 = (prazo: string) => (sheet: Sheet0) => {
      const base = rowOf(sheet, 'ACT-101');
      sheet.rows.push({ rowNumber: 6, cellRefs: base.cellRefs, cells: { ...base.cells, ID: 'ACT-105', Atividade: 'Planejar newsletter', 'Responsáveis': 'Ana', Prazo: prazo, Origem: '' } });
    };

    it('linha criada depois da carga e aceita continua sendo acompanhada', async () => {
      const v2 = registryV('v2', addRow105('2026-10-20'));
      await ingestExtracted(v2.meta, v2.doc, ctx);
      const [create] = await prisma.suggestion.findMany({ where: { kind: 'create', proposedId: 'ACT-105', reviewStatus: 'pending' } });
      expect(await reviewSuggestion(create.id, 'U-B', { action: 'accept' })).toMatchObject({ ok: true });
      expect(await pending()).toHaveLength(0);
      const v3 = registryV('v3', addRow105('2026-10-25'));
      await ingestExtracted(v3.meta, v3.doc, ctx);
      const upd = await pendingFor('ACT-105');
      expect(upd).toHaveLength(1);
      expect(JSON.parse(upd[0].proposedFields)).toEqual({ dueDate: '2026-10-25' });
    });

    it('linha removida da planilha substitui as sugestões pendentes e mantém a atividade', async () => {
      const v2 = registryV('v2', (sheet) => { rowOf(sheet, 'ACT-101').cells.Prazo = '2026-10-09'; });
      await ingestExtracted(v2.meta, v2.doc, ctx);
      expect(await pendingFor('ACT-101')).toHaveLength(1);
      const v3 = registryV('v3', (sheet) => { sheet.rows = sheet.rows.filter((r) => r.cells.ID !== 'ACT-101'); });
      await ingestExtracted(v3.meta, v3.doc, ctx);
      expect(await pendingFor('ACT-101')).toHaveLength(0);
      expect(await prisma.suggestion.count({ where: { targetActivityId: 'ACT-101', reviewStatus: 'superseded' } })).toBe(1);
      expect(await prisma.activity.findUnique({ where: { id: 'ACT-101' } })).not.toBeNull();
    });

    it('create pendente de linha que sumiu da planilha é substituído', async () => {
      const v2 = registryV('v2', addRow105('2026-10-20'));
      await ingestExtracted(v2.meta, v2.doc, ctx);
      expect(await pending()).toHaveLength(1);
      const v3 = registryV('v3', () => {});
      await ingestExtracted(v3.meta, v3.doc, ctx);
      expect(await pending()).toHaveLength(0);
      expect((await prisma.discardedItem.findMany()).some((d) => d.excerpt.startsWith('ACT-105'))).toBe(true);
    });
  });

  it('D: ata lida antes da importação inicial fica com erro e é reprocessada depois', async () => {
    await ingestSource(metaFor('INDEX.md'), md('01_CARGA_INICIAL/INDEX.md'), ctx);
    const out = await ingestSource(metaFor('Ata_2026-10-01.md'), md('01_CARGA_INICIAL/Ata_2026-10-01.md'), ctx);
    expect(out.status).toBe('error');
    expect(await prisma.suggestion.count()).toBe(0);
    expect((await prisma.source.findUnique({ where: { fileId: 'Ata_2026-10-01.md' } }))!.processedVersion).toBeNull();
    await ingestSource(metaFor('Ata_registro.xlsx'), xlsx('01_CARGA_INICIAL/Ata_registro.xlsx'), ctx);
    const again = await ingestSource(metaFor('Ata_2026-10-01.md'), md('01_CARGA_INICIAL/Ata_2026-10-01.md'), ctx);
    expect(again).toMatchObject({ status: 'processed', suggestionsCreated: 0 });
    expect(again.reason).toContain('origem');
    expect(await prisma.suggestion.count()).toBe(0);
  });

  it('E: o mesmo arquivo em conflito gera um único source_conflict mesmo com nova versão', async () => {
    await initialLoad();
    await ingestSource(metaFor('Ata - copia vazia.xlsx', { fileId: 'copia' }), xlsx('03_CONFLITO/Ata - copia vazia.xlsx'), ctx);
    await ingestSource(metaFor('Ata - copia vazia.xlsx', { fileId: 'copia', versionOrHash: 'v2' }), xlsx('03_CONFLITO/Ata - copia vazia.xlsx'), ctx);
    expect(await prisma.suggestion.count({ where: { kind: 'source_conflict' } })).toBe(1);
  });
});
