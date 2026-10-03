import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuleBasedProvider } from '@/lib/ai/rules';
import { emptyFields } from '@/lib/activity-fields';
import { createActivity } from '@/lib/activities/service';
import { prisma } from '@/lib/db';
import { ingestSource } from '@/lib/ingest';
import { handleReviewRequest } from '@/lib/suggestions/review-request';
import type { FetchedContent, SourceMeta } from '@/lib/types';
import { resetDb } from './helpers/db';

const analyzeFail = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/ingest', async (orig) => {
  const actual = await orig<typeof import('@/lib/ingest')>();
  return { ...actual, analyzeUnauthorizedSheet: (id: string) => (analyzeFail.on ? Promise.reject(new Error('boom')) : actual.analyzeUnauthorizedSheet(id)) };
});

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const fx = (p: string) => path.join(__dirname, 'fixtures', p);
const metaFor = (name: string): SourceMeta => ({
  fileId: name, name, mimeType: name.endsWith('.xlsx') ? XLSX : 'text/markdown', webUrl: `https://drive/${name}`,
  modifiedAt: new Date('2026-10-03T12:00:00Z'), versionOrHash: 'v1', path: 'LIA case teste', parentIds: ['root'],
});
const md = (p: string): FetchedContent => ({ format: 'markdown', text: readFileSync(fx(p), 'utf8') });
const xlsx = (p: string): FetchedContent => ({ format: 'xlsx', buffer: readFileSync(fx(p)) });

async function seed() {
  await prisma.source.create({ data: { fileId: 'ata03', name: 'Ata_2026-10-03', mimeType: 'x', webUrl: 'https://drive/ata03', modifiedAt: new Date('2026-10-03T12:00:00Z'), versionOrHash: 'd1', meta: '{}' } });
  await createActivity({ ...emptyFields(), title: 'Preparar carrossel', front: 'Growth', dueDate: '2026-10-05', ownerIds: ['U-A'] }, 'system', { origin: 'import', id: 'ACT-101' });
  return prisma.suggestion.create({
    data: {
      sourceFileId: 'ata03', sourceVersion: 'd1', kind: 'update', targetActivityId: 'ACT-101', front: 'Growth',
      proposedFields: JSON.stringify({ dueDate: '2026-10-07' }), currentSnapshot: JSON.stringify({ dueDate: '2026-10-05' }),
      evidence: 'mudou para 2026-10-07', reason: 'Ata alterou o prazo', dedupeKey: 'k1',
    },
  });
}

describe('handleReviewRequest', () => {
  beforeEach(async () => {
    analyzeFail.on = false;
    await resetDb();
  });

  it('corpo inválido -> 400', async () => {
    const s = await seed();
    expect((await handleReviewRequest(s.id, 'U-B', null)).status).toBe(400);
    expect((await handleReviewRequest(s.id, 'U-B', { action: 'x' })).status).toBe(400);
    expect((await handleReviewRequest(s.id, 'U-B', { action: 'adjust', fields: { dueDate: '07/10' } })).status).toBe(400);
  });
  it('id desconhecido -> 404', async () => {
    expect((await handleReviewRequest('nao-existe', 'U-B', { action: 'accept' })).status).toBe(404);
  });
  it('quem não revisa a frente -> 403 e nada muda', async () => {
    const s = await seed();
    const r = await handleReviewRequest(s.id, 'U-A', { action: 'accept' });
    expect(r.status).toBe(403);
    expect((await prisma.activity.findUnique({ where: { id: 'ACT-101' } }))!.dueDate).toBe('2026-10-05');
  });
  it('Bruno aceita -> 200 e atividade atualizada; segunda aceitação -> 409', async () => {
    const s = await seed();
    const r = await handleReviewRequest(s.id, 'U-B', { action: 'accept' });
    expect(r).toEqual({ status: 200, body: { ok: true, status: 'accepted', activityId: 'ACT-101', analyzed: null } });
    expect((await prisma.activity.findUnique({ where: { id: 'ACT-101' } }))!.dueDate).toBe('2026-10-07');
    expect((await handleReviewRequest(s.id, 'U-B', { action: 'accept' })).status).toBe(409);
  });
  it('rejeição com motivo em branco -> 400; com motivo -> 200', async () => {
    const s = await seed();
    expect((await handleReviewRequest(s.id, 'U-B', { action: 'reject', note: '   ' })).status).toBe(400);
    const r = await handleReviewRequest(s.id, 'U-B', { action: 'reject', note: 'Não foi isso' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'rejected' });
  });
  it("ajuste com dueDate '' propõe prazo nulo", async () => {
    const s = await seed();
    const r = await handleReviewRequest(s.id, 'U-B', { action: 'adjust', fields: { dueDate: '' } });
    expect(r).toMatchObject({ status: 200, body: { status: 'adjusted' } });
    expect((await prisma.activity.findUnique({ where: { id: 'ACT-101' } }))!.dueDate).toBeNull();
  });

  describe('conflito de fonte', () => {
    async function conflict() {
      const ctx = { provider: createRuleBasedProvider() };
      await ingestSource(metaFor('INDEX.md'), md('01_CARGA_INICIAL/INDEX.md'), ctx);
      await ingestSource(metaFor('Ata_registro.xlsx'), xlsx('01_CARGA_INICIAL/Ata_registro.xlsx'), ctx);
      await ingestSource(metaFor('Ata - copia vazia.xlsx'), xlsx('03_CONFLITO/Ata - copia vazia.xlsx'), ctx);
      return (await prisma.suggestion.findFirstOrThrow({ where: { kind: 'source_conflict', reviewStatus: 'pending' } })).id;
    }
    it('aceitar -> 200 com contagem analisada', async () => {
      const id = await conflict();
      const r = await handleReviewRequest(id, 'U-B', { action: 'accept' });
      expect(r).toMatchObject({ status: 200, body: { ok: true, status: 'accepted', analyzed: 0 } });
    });
    it('falha na análise depois de registrar a revisão ainda responde 200 com aviso', async () => {
      const id = await conflict();
      analyzeFail.on = true;
      const r = await handleReviewRequest(id, 'U-B', { action: 'accept' });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ ok: true, status: 'accepted', analyzed: null, analysisError: expect.stringContaining('análise da planilha falhou') });
      expect((await prisma.suggestion.findUnique({ where: { id } }))!.reviewStatus).toBe('accepted');
    });
  });
});
