import type { AIProvider } from '@/lib/ai/types';
import { prisma } from '@/lib/db';
import { isInsideTree, walkTree, type DriveFileWithPath } from '@/lib/drive/tree';
import { DriveError, FOLDER_MIME, GSHEET_MIME, XLSX_MIME, type DriveApi } from '@/lib/drive/types';
import { isIndexFile } from '@/lib/authority/classify';
import { ingestSource, markSourceUnavailable, mergeSourceMeta, restoreExtractedText, upsertSourceMeta, type IngestOutcome } from '@/lib/ingest';
import { parseJson } from '@/lib/json';
import type { FetchedContent, SourceMetaJson } from '@/lib/types';
import { fetchContent } from './fetch';
import { contentHash, driveRevision, toSourceMeta } from './meta';

export type SyncMode = 'initial' | 'incremental' | 'full' | 'manual';
export interface SyncDeps {
  api: DriveApi;
  provider: AIProvider;
  rootFolderId: string;
  now?: () => Date;
}
export interface SyncRunSummary {
  mode: SyncMode;
  skipped?: 'locked';
  processed: number;
  ignored: number;
  errors: number;
  unavailable: number;
  unchanged: number;
  error?: string;
}
type Tally = Omit<SyncRunSummary, 'mode' | 'skipped' | 'error'>;
type FileResult = IngestOutcome | 'unchanged' | 'unavailable' | 'error';

const LOCK_TIMEOUT_MS = 15 * 60_000;

export function describeError(e: unknown): string {
  if (e instanceof DriveError) return `${e.message} (HTTP ${e.status}${e.reason ? `, ${e.reason}` : ''})`;
  if (e instanceof Error) return e.message;
  return String(e);
}

export function isAuthError(e: unknown): boolean {
  if (e instanceof DriveError) return e.status === 401 || e.reason === 'invalid_grant';
  return /invalid_grant|invalid_client|unauthorized_client/i.test(e instanceof Error ? e.message : String(e));
}

function tally(t: Tally, r: FileResult): void {
  if (r === 'unchanged') t.unchanged++;
  else if (r === 'unavailable') t.unavailable++;
  else if (r === 'error') t.errors++;
  else if (r.status === 'processed') t.processed++;
  else if (r.status === 'ignored') t.ignored++;
  else t.errors++;
}

function priority(f: DriveFileWithPath): number {
  if (isIndexFile(f.name)) return 0;
  if (f.mimeType === XLSX_MIME || f.mimeType === GSHEET_MIME || f.name.toLowerCase().endsWith('.xlsx')) return 1;
  return 2;
}

async function processFile(deps: SyncDeps, file: DriveFileWithPath, force = false): Promise<FileResult> {
  const existing = await prisma.source.findUnique({ where: { fileId: file.id } });
  const revision = driveRevision(file);
  // Sem texto em cache (conta desconectada, arquivo que voltou da lixeira) a fonte precisa ser lida de novo.
  const textMissing = Boolean(existing && existing.kind !== 'unsupported' && existing.extractedText === null);
  const healthy = Boolean(existing && existing.syncStatus !== 'error' && existing.syncStatus !== 'unavailable') && !textMissing;

  if (!force && healthy && parseJson<SourceMetaJson>(existing!.meta, {}).driveRevision === revision) {
    if (existing!.name !== file.name || existing!.path !== file.path) await upsertSourceMeta(toSourceMeta(file, existing!.versionOrHash));
    return 'unchanged';
  }

  let content: FetchedContent;
  try {
    content = await fetchContent(deps.api, file);
  } catch (e) {
    await upsertSourceMeta(toSourceMeta(file, existing?.versionOrHash ?? revision));
    if (e instanceof DriveError && (e.status === 403 || e.status === 404)) {
      await markSourceUnavailable(file.id, `Sem acesso ao conteúdo do arquivo (HTTP ${e.status})`);
      return 'unavailable';
    }
    await prisma.source.update({ where: { fileId: file.id }, data: { syncStatus: 'error', statusReason: `Falha ao baixar o arquivo: ${describeError(e)}. Nova tentativa na próxima varredura completa (até 10 min).` } });
    return 'error';
  }

  const hash = contentHash(file, content);
  if (!force && healthy && existing!.processedVersion === hash) {
    await upsertSourceMeta(toSourceMeta(file, hash));
    await mergeSourceMeta(file.id, { driveRevision: revision });
    return 'unchanged';
  }
  // Mesmo conteúdo já analisado, só faltando o texto: restaura o cache sem reanalisar (nada de sugestões repetidas).
  const restorable = existing && existing.processedVersion === hash && content.format !== 'unsupported'
    && (existing.syncStatus === 'unavailable' || (existing.syncStatus === 'processed' && textMissing));
  if (!force && restorable) {
    const reason = existing.syncStatus === 'unavailable' ? 'Arquivo acessível de novo, com o mesmo conteúdo já analisado — texto restaurado sem nova análise' : undefined;
    const restored = await restoreExtractedText(toSourceMeta(file, hash), content, reason);
    if (restored.status !== 'error') await mergeSourceMeta(file.id, { driveRevision: revision });
    return restored;
  }
  const outcome = await ingestSource(toSourceMeta(file, hash), content, { provider: deps.provider });
  if (outcome.status !== 'error') await mergeSourceMeta(file.id, { driveRevision: revision });
  return outcome;
}

/** Falha em um arquivo nunca aborta o ciclo: vira contagem de erro e é repetida no próximo. */
async function processFileSafely(deps: SyncDeps, file: DriveFileWithPath, force = false): Promise<FileResult> {
  try {
    return await processFile(deps, file, force);
  } catch (e) {
    console.error(`[sync] falha ao processar o arquivo ${file.id}:`, describeError(e));
    try {
      await prisma.source.updateMany({ where: { fileId: file.id }, data: { syncStatus: 'error', statusReason: `Falha ao processar o arquivo: ${describeError(e)}. Nova tentativa na próxima varredura completa (até 10 min).` } });
    } catch {
      // melhor esforço
    }
    return 'error';
  }
}

export async function runCycle(deps: SyncDeps, requested: SyncMode): Promise<SyncRunSummary> {
  const now = deps.now ?? (() => new Date());
  await prisma.syncState.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const lock = await prisma.syncState.updateMany({
    where: { id: 1, OR: [{ runningSince: null }, { runningSince: { lt: new Date(now().getTime() - LOCK_TIMEOUT_MS) } }] },
    data: { runningSince: now(), status: 'running' },
  });
  const t: Tally = { processed: 0, ignored: 0, errors: 0, unavailable: 0, unchanged: 0 };
  if (lock.count === 0) return { mode: requested, skipped: 'locked', ...t };

  const state = (await prisma.syncState.findUnique({ where: { id: 1 } }))!;
  const mode: SyncMode = !state.startPageToken || state.folderId !== deps.rootFolderId ? 'initial' : requested;
  const run = await prisma.syncRun.create({ data: { mode } });

  try {
    let token = state.startPageToken;
    let folderName = state.folderName;
    if (mode === 'initial') {
      token = await deps.api.getStartPageToken();
      const root = await deps.api.getFile(deps.rootFolderId);
      if (!root) throw new Error('Pasta configurada (DRIVE_TEST_FOLDER_ID) não encontrada ou sem acesso');
      folderName = root.name;
    }

    let folderPaths = parseJson<Record<string, string>>(state.folderPaths, {});
    const candidates = new Map<string, DriveFileWithPath>();
    const fullScan = mode !== 'incremental';

    if (fullScan) {
      const tree = await walkTree(deps.api, deps.rootFolderId, folderName ?? 'Pasta monitorada');
      folderPaths = tree.folderPaths;
      for (const f of tree.files) candidates.set(f.id, f);
      const seen = new Set(tree.files.map((f) => f.id));
      const known = await prisma.source.findMany({ where: { NOT: { syncStatus: 'unavailable' } }, select: { fileId: true } });
      for (const s of known) {
        if (!seen.has(s.fileId) && (await markSourceUnavailable(s.fileId, 'Arquivo removido, movido para fora da pasta ou sem acesso'))) t.unavailable++;
      }
    } else if (!folderPaths[deps.rootFolderId]) {
      folderPaths[deps.rootFolderId] = folderName ?? 'Pasta monitorada';
    }

    const { changes, newStartPageToken } = await deps.api.listChanges(token!);
    for (const ch of changes) {
      if (ch.removed || !ch.file || ch.file.trashed) {
        candidates.delete(ch.fileId);
        if (await markSourceUnavailable(ch.fileId, ch.removed ? 'Arquivo removido ou acesso revogado' : 'Arquivo enviado para a lixeira')) t.unavailable++;
        continue;
      }
      if (ch.file.mimeType === FOLDER_MIME) continue; // pastas novas são resolvidas pela subida de pais e pela varredura
      const inside = await isInsideTree(deps.api, ch.file, folderPaths, deps.rootFolderId);
      if (inside) candidates.set(ch.file.id, { ...ch.file, path: inside.path });
      else {
        candidates.delete(ch.fileId);
        if (await markSourceUnavailable(ch.fileId, 'Arquivo movido para fora da pasta monitorada')) t.unavailable++;
      }
    }

    let authorityChanged = false;
    const counted = new Set<string>(); // arquivos já contabilizados neste ciclo
    const unchangedIds = new Set<string>(); // contabilizados como "sem mudança"
    const ingestedAfterChange = new Set<string>(); // realmente (re)classificados depois de a autoridade mudar
    for (const file of [...candidates.values()].sort((a, b) => priority(a) - priority(b) || a.name.localeCompare(b.name))) {
      const r = await processFileSafely(deps, file);
      tally(t, r);
      counted.add(file.id);
      if (r === 'unchanged') unchangedIds.add(file.id);
      if (authorityChanged && typeof r === 'object') ingestedAfterChange.add(file.id);
      if (typeof r === 'object' && r.authorityChanged) authorityChanged = true;
    }
    if (authorityChanged) {
      // planilhas não classificadas depois da mudança de autoridade (inclusive as "sem mudança") são reavaliadas
      const sheets = await prisma.source.findMany({
        where: {
          NOT: { syncStatus: 'unavailable' },
          OR: [{ mimeType: { in: [XLSX_MIME, GSHEET_MIME] } }, { name: { endsWith: '.xlsx' } }],
        },
      });
      for (const s of sheets) {
        if (ingestedAfterChange.has(s.fileId)) continue;
        try {
          const meta = await deps.api.getFile(s.fileId);
          if (!meta || meta.trashed) continue;
          const r = await processFileSafely(deps, { ...meta, path: s.path }, true);
          if (unchangedIds.has(s.fileId)) {
            t.unchanged--; // deixa de ser "sem mudança": foi reprocessado; cada arquivo é contado uma única vez
            tally(t, r);
          } else if (!counted.has(s.fileId)) tally(t, r);
          else if (r === 'error') t.errors++;
        } catch (e) {
          console.error(`[sync] falha ao reavaliar a planilha ${s.fileId}:`, describeError(e));
          t.errors++;
        }
      }
    }

    await prisma.syncState.update({
      where: { id: 1 },
      data: {
        folderId: deps.rootFolderId, folderName, startPageToken: newStartPageToken, folderPaths: JSON.stringify(folderPaths),
        status: 'idle', lastSuccessAt: now(), lastError: null, ...(fullScan ? { lastFullScanAt: now() } : {}),
      },
    });
    await prisma.syncRun.update({ where: { id: run.id }, data: { ...t, finishedAt: now() } });
    return { mode, ...t };
  } catch (e) {
    const message = describeError(e);
    await prisma.syncState.update({ where: { id: 1 }, data: { status: isAuthError(e) ? 'auth_required' : 'error', lastErrorAt: now(), lastError: message } });
    await prisma.syncRun.update({ where: { id: run.id }, data: { ...t, finishedAt: now(), error: message } });
    return { mode, ...t, error: message };
  } finally {
    await prisma.syncState.update({ where: { id: 1 }, data: { runningSince: null } });
  }
}
