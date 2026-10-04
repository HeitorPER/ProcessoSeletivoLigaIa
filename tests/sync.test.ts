import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRuleBasedProvider } from '@/lib/ai/rules';
import { prisma } from '@/lib/db';
import { DriveError, FOLDER_MIME, GDOC_MIME, XLSX_MIME, type DriveApi, type DriveChange, type DriveFileMeta } from '@/lib/drive/types';
import { runCycle } from '@/lib/sync/engine';
import { fetchContent } from '@/lib/sync/fetch';
import { decideRun } from '@/lib/sync/schedule';
import { resetDb } from './helpers/db';

type FakeFile = DriveFileMeta & { content?: Buffer; exportText?: string };
const ROOT = 'root';
const fx = (p: string) => readFileSync(path.join(__dirname, 'fixtures', p));

class FakeDrive implements DriveApi {
  files = new Map<string, FakeFile>();
  pending: DriveChange[] = [];
  token = 1;
  failList = false;
  failChanges: Error | null = null;
  failDownload = new Map<string, Error>();
  downloads = 0;
  exports = 0;
  add(f: FakeFile) { this.files.set(f.id, f); }
  change(id: string, removed = false) { this.pending.push({ fileId: id, removed, file: removed ? null : this.files.get(id) ?? null }); }
  async listChildren(folderId: string) {
    if (this.failList) throw new DriveError('backendError', 500);
    return [...this.files.values()].filter((f) => f.parents.includes(folderId) && !f.trashed);
  }
  async getFile(id: string) { return this.files.get(id) ?? null; }
  async download(id: string) {
    this.downloads++;
    const boom = this.failDownload.get(id);
    if (boom) throw boom;
    const f = this.files.get(id);
    if (!f?.content) throw new DriveError('notFound', 404);
    return f.content;
  }
  async exportFile(id: string) {
    this.exports++;
    const f = this.files.get(id);
    if (!f) throw new DriveError('notFound', 404);
    return Buffer.from(f.exportText ?? '');
  }
  async getStartPageToken() { return String(this.token); }
  async listChanges() {
    if (this.failChanges) throw this.failChanges;
    const changes = this.pending;
    this.pending = [];
    this.token++;
    return { changes, newStartPageToken: String(this.token) };
  }
}

let seq = 0;
function file(id: string, name: string, content: Buffer | string | null, over: Partial<FakeFile> = {}): FakeFile {
  return {
    id, name, mimeType: name.endsWith('.xlsx') ? XLSX_MIME : 'text/markdown', modifiedTime: '2026-10-03T12:00:00Z',
    md5Checksum: `md5-${id}-${++seq}`, version: '1', webViewLink: `https://drive.google.com/file/d/${id}/view`,
    parents: [ROOT], trashed: false, canDownload: true,
    content: content === null ? undefined : typeof content === 'string' ? Buffer.from(content) : content, ...over,
  };
}
const folder = (id: string, name: string, parents: string[]) => file(id, name, null, { mimeType: FOLDER_MIME, md5Checksum: null, parents });

function initialDrive(): FakeDrive {
  const d = new FakeDrive();
  d.add(folder(ROOT, 'LIA case teste', []));
  d.add(folder('sub', 'Atas', [ROOT]));
  d.add(file('reg', 'Ata_registro.xlsx', fx('01_CARGA_INICIAL/Ata_registro.xlsx'))); // antes do INDEX de propósito
  for (const f of ['INDEX.md', 'ESTADO-ATUAL.md', 'GUIA_INICIAL.md', 'PLANO_EDITORIAL_ANTIGO.md', 'Ata_2026-10-01.md']) d.add(file(f, f, fx(`01_CARGA_INICIAL/${f}`)));
  d.add(file('img', 'logo.png', 'png', { mimeType: 'image/png' }));
  d.add(file('docx', 'Ata_2026-10-03.docx', 'docx', { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', parents: ['sub'] }));
  return d;
}
const depsFor = (api: DriveApi) => ({ api, provider: createRuleBasedProvider(), rootFolderId: ROOT });

describe('ciclo de sincronização', () => {
  let drive: FakeDrive;
  beforeEach(async () => {
    await resetDb();
    drive = initialDrive();
    await runCycle(depsFor(drive), 'incremental');
  });

  it('primeira execução vira carga inicial completa', async () => {
    expect(await prisma.activity.count()).toBe(4);
    const state = await prisma.syncState.findUnique({ where: { id: 1 } });
    expect(state).toMatchObject({ folderId: ROOT, folderName: 'LIA case teste', status: 'idle', startPageToken: '2' });
    expect(state!.lastSuccessAt).not.toBeNull();
    expect(state!.lastFullScanAt).not.toBeNull();
    const run = await prisma.syncRun.findFirst();
    expect(run).toMatchObject({ mode: 'initial', processed: 6, ignored: 2, errors: 0 });
    const docx = await prisma.source.findUnique({ where: { fileId: 'docx' } });
    expect(docx).toMatchObject({ syncStatus: 'ignored', path: 'LIA case teste/Atas' });
    expect(docx!.statusReason).toContain('Google Docs');
  });

  it('pasta configurada trocada: pausa sem tocar no Drive nem nas atividades e explica como recomeçar', async () => {
    const before = await prisma.activity.count();
    const other = new FakeDrive();
    other.add(folder('outra', 'Outra pasta', []));
    other.add(file('reg2', 'Ata_registro.xlsx', fx('01_CARGA_INICIAL/Ata_registro.xlsx'), { parents: ['outra'] }));
    const out = await runCycle({ ...depsFor(other), rootFolderId: 'outra' }, 'full');
    expect(out.error).toContain('A pasta configurada (DRIVE_TEST_FOLDER_ID) mudou');
    expect(out.error).toContain('npm run db:reset');
    expect(out).toMatchObject({ processed: 0, unavailable: 0 });
    expect(await prisma.source.findUnique({ where: { fileId: 'reg2' } })).toBeNull();
    expect(await prisma.activity.count()).toBe(before);
    const state = await prisma.syncState.findUnique({ where: { id: 1 } });
    expect(state).toMatchObject({ folderId: ROOT, status: 'error', runningSince: null });
    expect(await prisma.source.count({ where: { syncStatus: 'unavailable' } })).toBe(0);
  });

  it('arquivo novo via changes vira sugestão; o mesmo evento duas vezes não duplica', async () => {
    drive.add(file('ata04', 'Ata_2026-10-04.md', fx('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-04.md'), { parents: ['sub'] }));
    drive.change('ata04');
    const r1 = await runCycle(depsFor(drive), 'incremental');
    expect(r1).toMatchObject({ mode: 'incremental', processed: 1 });
    drive.change('ata04');
    const r2 = await runCycle(depsFor(drive), 'incremental');
    expect(r2).toMatchObject({ processed: 0, unchanged: 1 });
    expect(await prisma.suggestion.count({ where: { sourceFileId: 'ata04' } })).toBe(1);
    expect((await prisma.source.findUnique({ where: { fileId: 'ata04' } }))!.path).toBe('LIA case teste/Atas');
  });

  it('edição gera nova versão sem duplicar a fonte; renomear não reprocessa', async () => {
    const original = fx('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-04.md').toString('utf8');
    drive.add(file('ata04', 'Ata_2026-10-04.md', original));
    drive.change('ata04');
    await runCycle(depsFor(drive), 'incremental');
    drive.add({ ...drive.files.get('ata04')!, content: Buffer.from(original.replace('2026-10-10', '2026-10-12')), md5Checksum: 'md5-ata04-editado' });
    drive.change('ata04');
    await runCycle(depsFor(drive), 'incremental');
    expect(await prisma.source.count({ where: { fileId: 'ata04' } })).toBe(1);
    const statuses = (await prisma.suggestion.findMany({ where: { sourceFileId: 'ata04' }, orderBy: { createdAt: 'asc' } })).map((s) => s.reviewStatus);
    expect(statuses).toEqual(['superseded', 'pending']);

    const downloads = drive.downloads;
    drive.add({ ...drive.files.get('ata04')!, name: 'Ata 04-10 (renomeada).md' });
    drive.change('ata04');
    await runCycle(depsFor(drive), 'incremental');
    expect(drive.downloads).toBe(downloads);
    expect((await prisma.source.findUnique({ where: { fileId: 'ata04' } }))!.name).toBe('Ata 04-10 (renomeada).md');
    expect(await prisma.suggestion.count({ where: { sourceFileId: 'ata04', reviewStatus: 'pending' } })).toBe(1);
  });

  it('Google Doc nativo: exporta markdown; renomear não cria nova sugestão', async () => {
    const text = fx('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-03.md').toString('utf8').replace(/-/g, '\\-').replace(/_/g, '\\_');
    drive.add(file('gdoc', 'Ata_2026-10-03', null, { mimeType: GDOC_MIME, md5Checksum: null, version: '5', exportText: text, parents: ['sub'] }));
    drive.change('gdoc');
    await runCycle(depsFor(drive), 'incremental');
    expect(await prisma.suggestion.count({ where: { sourceFileId: 'gdoc', reviewStatus: 'pending', targetActivityId: 'ACT-101' } })).toBe(1);
    drive.add({ ...drive.files.get('gdoc')!, name: 'Ata 03-10', version: '6' });
    drive.change('gdoc');
    await runCycle(depsFor(drive), 'incremental');
    expect(await prisma.suggestion.count({ where: { sourceFileId: 'gdoc' } })).toBe(1);
  });

  it('remoção e lixeira marcam a fonte como indisponível e apagam o cache', async () => {
    drive.change('GUIA_INICIAL.md', true);
    const r = await runCycle(depsFor(drive), 'incremental');
    expect(r.unavailable).toBe(1);
    expect(await prisma.source.findUnique({ where: { fileId: 'GUIA_INICIAL.md' } })).toMatchObject({ syncStatus: 'unavailable', extractedText: null });
  });

  it('varredura completa detecta arquivo sumido sem evento de mudança', async () => {
    drive.files.delete('ESTADO-ATUAL.md');
    await runCycle(depsFor(drive), 'full');
    expect((await prisma.source.findUnique({ where: { fileId: 'ESTADO-ATUAL.md' } }))!.syncStatus).toBe('unavailable');
  });

  it('falha na varredura não marca nada como indisponível nem avança o token', async () => {
    const before = await prisma.syncState.findUnique({ where: { id: 1 } });
    drive.failList = true;
    const r = await runCycle(depsFor(drive), 'full');
    expect(r.error).toContain('backendError');
    const after = await prisma.syncState.findUnique({ where: { id: 1 } });
    expect(after).toMatchObject({ status: 'error', startPageToken: before!.startPageToken });
    expect(after!.lastSuccessAt!.getTime()).toBe(before!.lastSuccessAt!.getTime());
    expect(await prisma.source.count({ where: { syncStatus: 'unavailable' } })).toBe(0);
    expect(after!.runningSince).toBeNull();
  });

  it('token revogado → estado auth_required', async () => {
    drive.failChanges = new DriveError('Token has been expired or revoked.', 400, 'invalid_grant');
    await runCycle(depsFor(drive), 'incremental');
    expect((await prisma.syncState.findUnique({ where: { id: 1 } }))!.status).toBe('auth_required');
  });

  it('arquivo fora da pasta monitorada é ignorado', async () => {
    drive.add(file('fora', 'fora.md', '# Ata\n\nAna fará algo até 2026-10-20.', { parents: ['outra-pasta'] }));
    drive.change('fora');
    await runCycle(depsFor(drive), 'incremental');
    expect(await prisma.source.findUnique({ where: { fileId: 'fora' } })).toBeNull();
  });

  it('planilha vazia homônima numa subpasta não apaga atividades', async () => {
    drive.add(file('copia', 'Ata - copia vazia.xlsx', fx('03_CONFLITO/Ata - copia vazia.xlsx'), { parents: ['sub'] }));
    drive.change('copia');
    await runCycle(depsFor(drive), 'incremental');
    expect(await prisma.activity.count()).toBe(4);
    expect(await prisma.suggestion.count({ where: { kind: 'source_conflict' } })).toBe(1);
  });

  it('arquivo cujo processamento lança erro vira "error"; os demais são processados e o token avança', async () => {
    drive.add(file('boom', 'boom.md', 'x'));
    drive.add(file('ata04', 'Ata_2026-10-04.md', fx('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-04.md'), { parents: ['sub'] }));
    drive.failDownload.set('boom', new Error('boom'));
    drive.change('boom');
    drive.change('ata04');
    const before = await prisma.syncState.findUnique({ where: { id: 1 } });
    const r = await runCycle(depsFor(drive), 'incremental');
    expect(r).toMatchObject({ processed: 1, errors: 1 });
    expect(r.error).toBeUndefined();
    expect(await prisma.source.findUnique({ where: { fileId: 'boom' } })).toMatchObject({ syncStatus: 'error' });
    expect(await prisma.suggestion.count({ where: { sourceFileId: 'ata04' } })).toBe(1);
    const after = await prisma.syncState.findUnique({ where: { id: 1 } });
    expect(after).toMatchObject({ status: 'idle', startPageToken: String(Number(before!.startPageToken) + 1) });
    // a próxima varredura tenta de novo e se recupera
    drive.failDownload.clear();
    const retry = await runCycle(depsFor(drive), 'full');
    expect(retry.errors).toBe(0);
    expect((await prisma.source.findUnique({ where: { fileId: 'boom' } }))!.syncStatus).not.toBe('error');
  });

  it('falha transitória de download (HTTP 500) vira "error", não "unavailable"', async () => {
    drive.add({ ...drive.files.get('ESTADO-ATUAL.md')!, md5Checksum: 'md5-estado-editado' });
    drive.failDownload.set('ESTADO-ATUAL.md', new DriveError('backendError', 500));
    drive.change('ESTADO-ATUAL.md');
    const r = await runCycle(depsFor(drive), 'incremental');
    expect(r).toMatchObject({ errors: 1, unavailable: 0 });
    const src = await prisma.source.findUnique({ where: { fileId: 'ESTADO-ATUAL.md' } });
    expect(src!.syncStatus).toBe('error');
    expect(src!.statusReason).toContain('próxima varredura completa');
  });

  it('403 por limite de taxa (após as novas tentativas) vira "error" e mantém o cache; 403 de permissão vira "unavailable"', async () => {
    drive.add({ ...drive.files.get('ESTADO-ATUAL.md')!, md5Checksum: 'md5-estado-editado' });
    drive.failDownload.set('ESTADO-ATUAL.md', new DriveError('User rate limit exceeded', 403, 'userRateLimitExceeded'));
    drive.change('ESTADO-ATUAL.md');
    const r = await runCycle(depsFor(drive), 'incremental');
    expect(r).toMatchObject({ errors: 1, unavailable: 0 });
    const src = await prisma.source.findUnique({ where: { fileId: 'ESTADO-ATUAL.md' } });
    expect(src!.syncStatus).toBe('error');
    expect(src!.extractedText).toBeTruthy();

    drive.failDownload.set('ESTADO-ATUAL.md', new DriveError('The user does not have sufficient permissions for this file.', 403, 'insufficientFilePermissions'));
    drive.change('ESTADO-ATUAL.md');
    expect(await runCycle(depsFor(drive), 'incremental')).toMatchObject({ unavailable: 1 });
    expect(await prisma.source.findUnique({ where: { fileId: 'ESTADO-ATUAL.md' } })).toMatchObject({ syncStatus: 'unavailable', extractedText: null });
  });

  it('403 por cota do Drive (diária, de download, de compartilhamento) vira "error" sem novas tentativas inúteis e mantém o cache', async () => {
    for (const reason of ['dailyLimitExceeded', 'quotaExceeded', 'downloadQuotaExceeded', 'sharingRateLimitExceeded']) {
      drive.add({ ...drive.files.get('ESTADO-ATUAL.md')!, md5Checksum: `md5-estado-${reason}` });
      drive.failDownload.set('ESTADO-ATUAL.md', new DriveError('Quota exceeded', 403, reason));
      drive.change('ESTADO-ATUAL.md');
      const r = await runCycle(depsFor(drive), 'incremental');
      expect(r, reason).toMatchObject({ errors: 1, unavailable: 0 });
      const src = await prisma.source.findUnique({ where: { fileId: 'ESTADO-ATUAL.md' } });
      expect(src!.syncStatus, reason).toBe('error');
      expect(src!.extractedText, reason).toBeTruthy();
    }
  });

  it('arquivo na lixeira (evento com trashed) vira indisponível', async () => {
    drive.add({ ...drive.files.get('GUIA_INICIAL.md')!, trashed: true });
    drive.change('GUIA_INICIAL.md');
    const r = await runCycle(depsFor(drive), 'incremental');
    expect(r.unavailable).toBe(1);
    expect(await prisma.source.findUnique({ where: { fileId: 'GUIA_INICIAL.md' } })).toMatchObject({ syncStatus: 'unavailable', extractedText: null });
  });

  it('arquivo conhecido movido para fora da pasta vira indisponível', async () => {
    drive.add({ ...drive.files.get('Ata_2026-10-01.md')!, parents: ['outra-pasta'] });
    drive.change('Ata_2026-10-01.md');
    const r = await runCycle(depsFor(drive), 'incremental');
    expect(r.unavailable).toBe(1);
    const src = await prisma.source.findUnique({ where: { fileId: 'Ata_2026-10-01.md' } });
    expect(src!.syncStatus).toBe('unavailable');
    expect(src!.statusReason).toContain('fora da pasta');
  });

  it('Google Doc movido de fora para dentro da pasta (subpasta) é detectado pelo changes e analisado', async () => {
    drive.add(folder('fora', 'Rascunhos', []));
    drive.add(file('gdoc03', 'Ata_2026-10-03', null, { mimeType: GDOC_MIME, md5Checksum: null, parents: ['fora'], exportText: fx('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-03.md').toString('utf8') }));
    await runCycle(depsFor(drive), 'incremental');
    expect(await prisma.source.findUnique({ where: { fileId: 'gdoc03' } })).toBeNull(); // fora da pasta: ignorado

    drive.add({ ...drive.files.get('gdoc03')!, parents: ['sub'] }); // movido para a subpasta "Atas"
    drive.change('gdoc03');
    const r = await runCycle(depsFor(drive), 'incremental');
    expect(r).toMatchObject({ processed: 1, errors: 0 });
    expect(await prisma.source.findUnique({ where: { fileId: 'gdoc03' } })).toMatchObject({ kind: 'minutes', syncStatus: 'processed', path: 'LIA case teste/Atas' });
    expect(await prisma.suggestion.count({ where: { sourceFileId: 'gdoc03', kind: 'update', targetActivityId: 'ACT-101', reviewStatus: 'pending' } })).toBe(1);
  });

  it('mudança no INDEX reavalia as planilhas não modificadas, uma vez cada', async () => {
    drive.add(file('outro', 'Outro_registro.xlsx', fx('01_CARGA_INICIAL/Ata_registro.xlsx')));
    drive.change('outro');
    await runCycle(depsFor(drive), 'incremental');
    expect((await prisma.source.findUnique({ where: { fileId: 'outro' } }))!.kind).toBe('unauthorized_sheet');
    expect((await prisma.source.findUnique({ where: { fileId: 'reg' } }))!.kind).toBe('activity_registry');
    const regBefore = (await prisma.source.findUnique({ where: { fileId: 'reg' } }))!.lastProcessedAt!;
    const outroBefore = (await prisma.source.findUnique({ where: { fileId: 'outro' } }))!.lastProcessedAt!;

    const index = fx('01_CARGA_INICIAL/INDEX.md').toString('utf8');
    expect(index).toContain('`Ata_registro.xlsx`, aba `Atividades`');
    drive.add({ ...drive.files.get('INDEX.md')!, content: Buffer.from(index.replace('`Ata_registro.xlsx`', '`Outro_registro.xlsx`')), md5Checksum: 'md5-index-editado' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const r = await runCycle(depsFor(drive), 'full');

    // as duas planilhas não mudaram no Drive, mas foram reavaliadas contra o novo INDEX
    const reg = await prisma.source.findUnique({ where: { fileId: 'reg' } });
    const outro = await prisma.source.findUnique({ where: { fileId: 'outro' } });
    expect(reg!.lastProcessedAt!.getTime()).toBeGreaterThan(regBefore.getTime());
    expect(outro!.lastProcessedAt!.getTime()).toBeGreaterThan(outroBefore.getTime());
    expect(reg!.kind).not.toBe('activity_registry'); // deixou de ser a fonte nomeada no INDEX
    // INDEX + 2 planilhas reprocessadas; cada arquivo é contado uma única vez (9 arquivos monitorados)
    expect(r).toMatchObject({ mode: 'full', processed: 3, errors: 0, unavailable: 0 });
    expect(r.processed + r.ignored + r.errors + r.unavailable + r.unchanged).toBe(9);
  });

  describe('texto em cache apagado (desconectar e reconectar)', () => {
    const counting = () => {
      const base = createRuleBasedProvider();
      const calls = { extract: 0 };
      return { calls, provider: { ...base, extract: (...args: Parameters<typeof base.extract>) => { calls.extract++; return base.extract(...args); } } };
    };

    it('a próxima varredura completa restaura o texto sem reanalisar nem criar sugestões', async () => {
      drive.add(file('ata04', 'Ata_2026-10-04.md', fx('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-04.md'), { parents: ['sub'] }));
      drive.change('ata04');
      await runCycle(depsFor(drive), 'incremental');
      const suggestionsBefore = await prisma.suggestion.findMany({ orderBy: { id: 'asc' } });
      expect(suggestionsBefore).toHaveLength(1);

      await prisma.source.updateMany({ data: { extractedText: null } }); // mesmo efeito de disconnectGoogle
      const { calls, provider } = counting();
      const r = await runCycle({ ...depsFor(drive), provider }, 'full');

      expect(r).toMatchObject({ processed: 7, errors: 0, unavailable: 0, unchanged: 2 });
      for (const id of ['ESTADO-ATUAL.md', 'GUIA_INICIAL.md', 'Ata_2026-10-01.md', 'ata04', 'reg']) {
        const src = await prisma.source.findUnique({ where: { fileId: id } });
        expect(src!.extractedText, id).toBeTruthy();
        expect(src!.syncStatus, id).toBe('processed');
      }
      expect((await prisma.source.findUnique({ where: { fileId: 'ESTADO-ATUAL.md' } }))!.extractedText).toContain('#');
      expect((await prisma.source.findUnique({ where: { fileId: 'Ata_2026-10-01.md' } }))!.statusReason).toContain('origem');
      expect(calls.extract).toBe(0);
      expect(await prisma.suggestion.findMany({ orderBy: { id: 'asc' } })).toEqual(suggestionsBefore);
      expect(await prisma.suggestion.count({ where: { reviewStatus: 'superseded' } })).toBe(0);

      // depois de restaurado, o ciclo seguinte volta a ser "sem mudança"
      expect(await runCycle({ ...depsFor(drive), provider }, 'full')).toMatchObject({ processed: 0, unchanged: 9 });
    });

    it('ata na lixeira e restaurada com o mesmo conteúdo não é reanalisada', async () => {
      const ata01 = drive.files.get('Ata_2026-10-01.md')!;
      drive.add({ ...ata01, trashed: true });
      drive.change('Ata_2026-10-01.md');
      expect((await runCycle(depsFor(drive), 'incremental')).unavailable).toBe(1);

      drive.add({ ...ata01, trashed: false });
      drive.change('Ata_2026-10-01.md');
      const { calls, provider } = counting();
      const r = await runCycle({ ...depsFor(drive), provider }, 'incremental');
      expect(r).toMatchObject({ processed: 1, errors: 0 });
      const src = await prisma.source.findUnique({ where: { fileId: 'Ata_2026-10-01.md' } });
      expect(src).toMatchObject({ syncStatus: 'processed', kind: 'minutes' });
      expect(src!.extractedText).toContain('ACT-101');
      expect(calls.extract).toBe(0);
      expect(await prisma.suggestion.count()).toBe(0);
    });

    it('INDEX mudou no mesmo ciclo em que o texto foi apagado: as planilhas são reclassificadas, não só restauradas', async () => {
      drive.add(file('outro', 'Outro_registro.xlsx', fx('01_CARGA_INICIAL/Ata_registro.xlsx')));
      drive.change('outro');
      await runCycle(depsFor(drive), 'incremental');
      const outroBefore = (await prisma.source.findUnique({ where: { fileId: 'outro' } }))!;
      expect(outroBefore.kind).toBe('unauthorized_sheet');

      await prisma.source.updateMany({ data: { extractedText: null } }); // mesmo efeito de disconnectGoogle
      const index = fx('01_CARGA_INICIAL/INDEX.md').toString('utf8');
      drive.add({ ...drive.files.get('INDEX.md')!, content: Buffer.from(index.replace('`Ata_registro.xlsx`', '`Outro_registro.xlsx`')), md5Checksum: 'md5-index-editado' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      const r = await runCycle(depsFor(drive), 'full');

      const reg = (await prisma.source.findUnique({ where: { fileId: 'reg' } }))!;
      const outro = (await prisma.source.findUnique({ where: { fileId: 'outro' } }))!;
      expect(reg.kind).not.toBe('activity_registry'); // deixou de ser a fonte nomeada no INDEX
      // mesmo tipo de antes, mas reavaliada contra o novo INDEX (não apenas restaurada)
      expect(outro.lastProcessedAt!.getTime()).toBeGreaterThan(outroBefore.lastProcessedAt!.getTime());
      expect(outro.statusReason).toContain('mesmo nome da fonte vigente');
      for (const s of [reg, outro]) expect(s.extractedText, s.fileId).toBeTruthy();
      expect(r).toMatchObject({ errors: 0, unavailable: 0 });
      expect(r.processed + r.ignored + r.errors + r.unavailable + r.unchanged).toBe(9);
    });

    it('ata que volta da lixeira depois de o INDEX marcá-la como superada vira histórico (não fica como ata)', async () => {
      const ata01 = drive.files.get('Ata_2026-10-01.md')!;
      drive.add({ ...ata01, trashed: true });
      drive.change('Ata_2026-10-01.md');
      const index = fx('01_CARGA_INICIAL/INDEX.md').toString('utf8');
      drive.add({ ...drive.files.get('INDEX.md')!, content: Buffer.from(`${index}\n\`Ata_2026-10-01.md\` foi superado por \`GUIA_INICIAL.md\`.\n`), md5Checksum: 'md5-index-superada' });
      drive.change('INDEX.md');
      expect((await runCycle(depsFor(drive), 'incremental')).unavailable).toBe(1);

      drive.add({ ...ata01, trashed: false });
      drive.change('Ata_2026-10-01.md');
      const { calls, provider } = counting();
      const r = await runCycle({ ...depsFor(drive), provider }, 'incremental');
      expect(r).toMatchObject({ processed: 1, errors: 0 });
      const src = await prisma.source.findUnique({ where: { fileId: 'Ata_2026-10-01.md' } });
      expect(src).toMatchObject({ syncStatus: 'processed', kind: 'deprecated' });
      expect(src!.extractedText).toContain('ACT-101');
      expect(calls.extract).toBe(0);
      expect(await prisma.suggestion.count()).toBe(0);
    });
  });

  it('ciclos concorrentes: o segundo é ignorado pelo lock', async () => {
    await prisma.syncState.update({ where: { id: 1 }, data: { runningSince: new Date() } });
    expect(await runCycle(depsFor(drive), 'incremental')).toMatchObject({ skipped: 'locked' });
  });
});

describe('fetchContent', () => {
  it('formatos e motivos', async () => {
    const d = new FakeDrive();
    expect(await fetchContent(d, file('x', 'foto.png', 'p', { mimeType: 'image/png' }))).toEqual({ format: 'unsupported', reason: 'Formato ainda não processado (image/png)' });
    expect(await fetchContent(d, file('s', 'Slides', null, { mimeType: 'application/vnd.google-apps.presentation' }))).toMatchObject({ format: 'unsupported' });
    d.add(file('m', 'a.md', '# A'));
    expect(await fetchContent(d, d.files.get('m')!)).toEqual({ format: 'markdown', text: '# A' });
  });
});

describe('decideRun', () => {
  const base = { incrementalMs: 120_000, fullMs: 600_000, now: 1_000_000 };
  it('pedido manual tem prioridade; depois incremental; varredura a cada 10 min', () => {
    expect(decideRun({ ...base, hasRequest: true, lastRunAt: base.now, lastFullScanAt: base.now })).toBe('manual');
    expect(decideRun({ ...base, hasRequest: false, lastRunAt: base.now - 60_000, lastFullScanAt: base.now })).toBeNull();
    expect(decideRun({ ...base, hasRequest: false, lastRunAt: base.now - 130_000, lastFullScanAt: base.now - 130_000 })).toBe('incremental');
    expect(decideRun({ ...base, hasRequest: false, lastRunAt: base.now - 130_000, lastFullScanAt: base.now - 700_000 })).toBe('full');
    expect(decideRun({ ...base, hasRequest: false, lastRunAt: null, lastFullScanAt: null })).toBe('full');
  });
});
