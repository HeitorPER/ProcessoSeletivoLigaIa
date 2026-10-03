import { createHash } from 'node:crypto';
import { pickFields } from '@/lib/activity-fields';
import { getActivitySnapshot } from '@/lib/activities/service';
import { prisma } from '@/lib/db';
import { stableStringify } from '@/lib/json';
import type { ActivityFields, DiscardedExcerpt, ProposedSuggestion } from '@/lib/types';

/** Idempotente: a mesma proposta para o mesmo arquivo e versão nunca é gravada duas vezes. */
export async function saveSuggestion(p: ProposedSuggestion, source: { fileId: string; versionOrHash: string }): Promise<boolean> {
  const dedupeKey = createHash('sha256')
    .update([source.fileId, source.versionOrHash, p.kind, p.targetActivityId ?? p.proposedId ?? '', stableStringify(p.proposedFields)].join('|'))
    .digest('hex');
  if (await prisma.suggestion.findUnique({ where: { dedupeKey } })) return false;
  const current = p.targetActivityId ? await getActivitySnapshot(p.targetActivityId) : null;
  const currentSnapshot = current ? JSON.stringify(pickFields(current, Object.keys(p.proposedFields) as (keyof ActivityFields)[])) : null;
  try {
    await prisma.suggestion.create({
      data: {
        sourceFileId: source.fileId, sourceVersion: source.versionOrHash, kind: p.kind,
        targetActivityId: p.targetActivityId, proposedId: p.proposedId ?? null,
        proposedFields: JSON.stringify(p.proposedFields), currentSnapshot,
        evidence: p.evidence, evidenceLocator: p.evidenceLocator, reason: p.reason,
        uncertainties: JSON.stringify(p.uncertainties), front: p.front, dedupeKey,
      },
    });
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
