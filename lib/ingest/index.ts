import type { AIProvider } from '@/lib/ai/types';
import { parseIndex } from '@/lib/authority/index-parser';
import { classify, isIndexFile } from '@/lib/authority/classify';
import { prisma } from '@/lib/db';
import { docToStoredText, extractDoc } from '@/lib/extract';
import { parseJson, stableStringify } from '@/lib/json';
import type { ExtractedDoc, FetchedContent, MarkdownDoc, SourceKind, SourceMeta, SourceMetaJson, SpreadsheetDoc } from '@/lib/types';
import { registerSourceConflict } from './conflict';
import { processMinutes } from './minutes';
import { handleRegistry } from './registry';
import { getSyncState, loadAuthority, upsertSourceMeta } from './sources';

export { analyzeUnauthorizedSheet } from './conflict';
export { markSourceUnavailable, mergeSourceMeta, upsertSourceMeta } from './sources';

export interface IngestContext {
  provider: AIProvider;
}
export interface IngestOutcome {
  status: 'processed' | 'ignored' | 'error';
  kind: SourceKind | null;
  reason: string;
  suggestionsCreated: number;
  authorityChanged: boolean;
}

export async function ingestSource(meta: SourceMeta, content: FetchedContent, ctx: IngestContext): Promise<IngestOutcome> {
  await upsertSourceMeta(meta);
  if (content.format === 'unsupported') {
    await prisma.source.update({
      where: { fileId: meta.fileId },
      data: { kind: 'unsupported', syncStatus: 'ignored', statusReason: content.reason, processedVersion: meta.versionOrHash, lastProcessedAt: new Date(), extractedText: null },
    });
    return { status: 'ignored', kind: 'unsupported', reason: content.reason, suggestionsCreated: 0, authorityChanged: false };
  }
  let doc: ExtractedDoc;
  try {
    doc = await extractDoc(content);
  } catch (e) {
    const reason = `Não foi possível ler o arquivo: ${(e as Error).message}`;
    await prisma.source.update({ where: { fileId: meta.fileId }, data: { syncStatus: 'error', statusReason: reason } });
    return { status: 'error', kind: null, reason, suggestionsCreated: 0, authorityChanged: false };
  }
  return ingestExtracted(meta, doc, ctx);
}

/**
 * Conteúdo idêntico ao já analisado (`processedVersion`), mas sem texto em cache — depois de desconectar
 * a conta ou de o arquivo voltar da lixeira. Só extrai e regrava o texto: não reclassifica, não reanalisa
 * e não cria nem substitui sugestões. `statusReason` substitui o motivo atual quando informado.
 */
export async function restoreExtractedText(meta: SourceMeta, content: Exclude<FetchedContent, { format: 'unsupported' }>, statusReason?: string): Promise<IngestOutcome> {
  const existing = await prisma.source.findUnique({ where: { fileId: meta.fileId } });
  await upsertSourceMeta(meta);
  let doc: ExtractedDoc;
  try {
    doc = await extractDoc(content);
  } catch (e) {
    const reason = `Não foi possível ler o arquivo: ${(e as Error).message}`;
    await prisma.source.update({ where: { fileId: meta.fileId }, data: { syncStatus: 'error', statusReason: reason } });
    return { status: 'error', kind: null, reason, suggestionsCreated: 0, authorityChanged: false };
  }
  const metaJson = parseJson<SourceMetaJson>(existing?.meta, {});
  if (doc.kind === 'markdown') metaJson.frontMatter = doc.frontMatter;
  const reason = statusReason ?? existing?.statusReason ?? 'Texto restaurado';
  await prisma.source.update({
    where: { fileId: meta.fileId },
    data: { syncStatus: 'processed', statusReason: reason, extractedText: docToStoredText(doc), meta: JSON.stringify(metaJson) },
  });
  return { status: 'processed', kind: (existing?.kind as SourceKind | undefined) ?? null, reason, suggestionsCreated: 0, authorityChanged: false };
}

export async function ingestExtracted(meta: SourceMeta, doc: ExtractedDoc, ctx: IngestContext): Promise<IngestOutcome> {
  const existing = await prisma.source.findUnique({ where: { fileId: meta.fileId } });
  await upsertSourceMeta(meta);
  const metaJson = parseJson<SourceMetaJson>(existing?.meta, {});
  let authority = await loadAuthority();
  let authorityChanged = false;

  if (doc.kind === 'markdown') metaJson.frontMatter = doc.frontMatter;
  if (doc.kind === 'markdown' && isIndexFile(meta.name)) {
    const state = await getSyncState();
    if (!state.authorityIndexFileId || state.authorityIndexFileId === meta.fileId) {
      const config = parseIndex(doc);
      authorityChanged = stableStringify(config) !== stableStringify(authority.config);
      metaJson.authority = config;
      authority = { ...authority, config };
      await prisma.syncState.update({ where: { id: 1 }, data: { authorityIndexFileId: meta.fileId } });
    }
  }

  const c = classify({ fileId: meta.fileId, name: meta.name, mimeType: meta.mimeType, doc }, authority);
  metaJson.meetingDate = c.meetingDate;
  let created = 0;
  let reason = c.reason;
  try {
    if (c.kind === 'activity_registry') {
      created = await handleRegistry(meta, doc as SpreadsheetDoc, c.registrySheet!, metaJson);
    } else if (c.kind === 'minutes') {
      const r = await processMinutes(meta, doc as MarkdownDoc, c.meetingDate, ctx.provider, !existing?.processedVersion);
      created = r.created;
      if (r.note) reason = r.note;
    } else if (c.kind === 'unauthorized_sheet') {
      created = await registerSourceConflict(meta, doc as SpreadsheetDoc, c.reason);
    }
  } catch (e) {
    const msg = `${c.kind === 'minutes' ? 'Análise da ata falhou' : 'Processamento falhou'}: ${(e as Error).message}. Nova tentativa na próxima varredura completa (até 10 min).`;
    await prisma.source.update({ where: { fileId: meta.fileId }, data: { kind: c.kind, syncStatus: 'error', statusReason: msg, meta: JSON.stringify(metaJson) } });
    return { status: 'error', kind: c.kind, reason: msg, suggestionsCreated: 0, authorityChanged };
  }

  await prisma.source.update({
    where: { fileId: meta.fileId },
    data: {
      kind: c.kind, syncStatus: 'processed', statusReason: reason, processedVersion: meta.versionOrHash,
      lastProcessedAt: new Date(), extractedText: docToStoredText(doc), meta: JSON.stringify(metaJson),
    },
  });
  return { status: 'processed', kind: c.kind, reason, suggestionsCreated: created, authorityChanged };
}
