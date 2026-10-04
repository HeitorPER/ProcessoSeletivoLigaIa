import { createHash } from 'node:crypto';
import { pickFields } from '@/lib/activity-fields';
import { getActivitySnapshot } from '@/lib/activities/service';
import { prisma } from '@/lib/db';
import { parseJson, stableStringify } from '@/lib/json';
import type { ActivityFields, DiscardedExcerpt, ProposedSuggestion } from '@/lib/types';

export interface SaveOptions {
  /** A chave de deduplicação ignora a versão: a mesma proposta nunca é recriada entre versões do arquivo. */
  versionless?: boolean;
}

/**
 * Idempotente: a mesma proposta para o mesmo arquivo e versão nunca é gravada duas vezes.
 * Com `versionless`, a deduplicação vale entre versões (proposta rejeitada continua rejeitada;
 * proposta substituída volta a ficar pendente se a planilha voltar a pedi-la).
 */
export async function saveSuggestion(p: ProposedSuggestion, source: { fileId: string; versionOrHash: string }, opts: SaveOptions = {}): Promise<boolean> {
  const dedupeKey = createHash('sha256')
    .update([source.fileId, ...(opts.versionless ? [] : [source.versionOrHash]), p.kind, p.targetActivityId ?? p.proposedId ?? '', stableStringify(p.proposedFields)].join('|'))
    .digest('hex');
  const existing = await prisma.suggestion.findUnique({ where: { dedupeKey } });
  const current = p.targetActivityId ? await getActivitySnapshot(p.targetActivityId) : null;
  const currentSnapshot = current ? JSON.stringify(pickFields(current, Object.keys(p.proposedFields) as (keyof ActivityFields)[])) : null;
  const data = {
    sourceFileId: source.fileId, sourceVersion: source.versionOrHash, kind: p.kind,
    targetActivityId: p.targetActivityId, proposedId: p.proposedId ?? null,
    proposedFields: JSON.stringify(p.proposedFields), currentSnapshot,
    evidence: p.evidence, evidenceLocator: p.evidenceLocator, reason: p.reason,
    uncertainties: JSON.stringify(p.uncertainties), front: p.front,
  };
  if (existing) {
    if (opts.versionless && existing.reviewStatus === 'superseded') {
      await prisma.suggestion.update({ where: { id: existing.id }, data: { ...data, reviewStatus: 'pending', reviewedAt: null, reviewNote: null } });
      return true;
    }
    return false;
  }
  try {
    await prisma.suggestion.create({ data: { ...data, dedupeKey } });
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return false;
    throw e;
  }
}

export async function supersedePending(fileId: string, currentVersion: string): Promise<number> {
  const r = await prisma.suggestion.updateMany({
    where: { sourceFileId: fileId, reviewStatus: 'pending', NOT: { sourceVersion: currentVersion } },
    data: { reviewStatus: 'superseded', reviewedAt: new Date(), reviewNote: 'Documento foi editado; sugestão substituída pela análise da nova versão' },
  });
  return r.count;
}

/**
 * Substitui as sugestões pendentes do mesmo arquivo e alvo (update: atividade; create: proposedId)
 * cujos campos propostos diferem de `keep`. Com `keep = null`, substitui todas.
 */
export async function supersedePendingForTarget(
  fileId: string,
  kind: 'create' | 'update',
  id: string,
  keep: Record<string, unknown> | null,
  note: string,
): Promise<number> {
  const rows = await prisma.suggestion.findMany({
    where: { sourceFileId: fileId, reviewStatus: 'pending', kind, ...(kind === 'update' ? { targetActivityId: id } : { proposedId: id }) },
  });
  const keepKey = keep ? stableStringify(keep) : null;
  const stale = rows.filter((s) => keepKey === null || stableStringify(parseJson<Record<string, unknown>>(s.proposedFields, {})) !== keepKey).map((s) => s.id);
  if (stale.length === 0) return 0;
  const r = await prisma.suggestion.updateMany({ where: { id: { in: stale } }, data: { reviewStatus: 'superseded', reviewedAt: new Date(), reviewNote: note } });
  return r.count;
}

export async function saveDiscarded(fileId: string, version: string, items: DiscardedExcerpt[]): Promise<number> {
  let created = 0;
  for (const d of items) {
    const where = { sourceFileId_sourceVersion_excerpt: { sourceFileId: fileId, sourceVersion: version, excerpt: d.excerpt } };
    if (await prisma.discardedItem.findUnique({ where })) continue;
    await prisma.discardedItem.create({ data: { sourceFileId: fileId, sourceVersion: version, excerpt: d.excerpt, reason: d.reason } });
    created++;
  }
  return created;
}
