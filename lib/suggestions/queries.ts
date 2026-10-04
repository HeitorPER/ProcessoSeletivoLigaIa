import { pickFields } from '@/lib/activity-fields';
import { toFields } from '@/lib/activities/fields';
import { prisma } from '@/lib/db';
import { parseJson } from '@/lib/json';
import { canReview, loadMembers, reviewersFor } from '@/lib/members';
import type { ActivityFields, ActivityPatch, MemberInfo, ReviewStatus, SourceMetaJson, SuggestionKind } from '@/lib/types';

export interface SuggestionView {
  id: string;
  kind: SuggestionKind;
  reviewStatus: ReviewStatus;
  targetActivityId: string | null;
  targetTitle: string | null;
  proposedId: string | null;
  proposedFields: ActivityPatch;
  currentSnapshot: ActivityPatch;
  evidence: string;
  evidenceLocator: string | null;
  reason: string;
  uncertainties: string[];
  front: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewNote: string | null;
  reviewerName: string | null;
  resultActivityId: string | null;
  source: { fileId: string; name: string; webUrl: string; syncStatus: string; documentDate: string | null; modifiedAt: Date };
  canReview: boolean;
  /** Conflito cuja planilha saiu da pasta: continua pendente, mas só pode ser descartado (motivo da indisponibilidade). */
  analysisBlockedReason: string | null;
  reviewerNames: string[];
}

export async function listSuggestions(group: 'pending' | 'reviewed', viewer: MemberInfo): Promise<SuggestionView[]> {
  const members = await loadMembers();
  const rows = await prisma.suggestion.findMany({
    where: group === 'pending' ? { reviewStatus: 'pending' } : { NOT: { reviewStatus: 'pending' } },
    include: { source: true, target: { include: { owners: true } } },
    orderBy: group === 'pending' ? { createdAt: 'desc' } : { reviewedAt: 'desc' },
    take: group === 'pending' ? undefined : 50,
  });
  /** Pendente de atualização compara com o oficial de agora; revisada mantém a foto do momento da sugestão. */
  const officialNow = (s: (typeof rows)[number], proposed: ActivityPatch): ActivityPatch =>
    s.reviewStatus === 'pending' && s.kind === 'update' && s.target
      ? pickFields(toFields(s.target), Object.keys(proposed) as (keyof ActivityFields)[])
      : parseJson<ActivityPatch>(s.currentSnapshot, {});
  return rows.map((s) => {
    const proposedFields = parseJson<ActivityPatch>(s.proposedFields, {});
    return {
      id: s.id,
      kind: s.kind as SuggestionKind,
      reviewStatus: s.reviewStatus as ReviewStatus,
      targetActivityId: s.targetActivityId,
      targetTitle: s.target?.title ?? null,
      proposedId: s.proposedId,
      proposedFields,
      currentSnapshot: officialNow(s, proposedFields),
      evidence: s.evidence,
      evidenceLocator: s.evidenceLocator,
      reason: s.reason,
      uncertainties: parseJson<string[]>(s.uncertainties, []),
      front: s.front,
      createdAt: s.createdAt,
      reviewedAt: s.reviewedAt,
      reviewNote: s.reviewNote,
      reviewerName: s.reviewerId ? (members.find((m) => m.id === s.reviewerId)?.displayName ?? s.reviewerId) : null,
      resultActivityId: s.resultActivityId,
      source: {
        fileId: s.source.fileId,
        name: s.source.name,
        webUrl: s.source.webUrl,
        syncStatus: s.source.syncStatus,
        documentDate: parseJson<SourceMetaJson>(s.source.meta, {}).meetingDate ?? null,
        modifiedAt: s.source.modifiedAt,
      },
      canReview: canReview(viewer, s.front, members),
      analysisBlockedReason: s.kind === 'source_conflict' && s.source.syncStatus === 'unavailable' ? (s.source.statusReason ?? 'Arquivo fora da pasta monitorada') : null,
      reviewerNames: reviewersFor(s.front, members).map((m) => m.displayName),
    };
  });
}

export async function listDiscarded(limit = 30) {
  const rows = await prisma.discardedItem.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  const sources = await prisma.source.findMany({ where: { fileId: { in: [...new Set(rows.map((r) => r.sourceFileId))] } } });
  return rows.map((r) => {
    const s = sources.find((x) => x.fileId === r.sourceFileId);
    return { id: r.id, excerpt: r.excerpt, reason: r.reason, sourceName: s?.name ?? r.sourceFileId, sourceUrl: s?.webUrl ?? '#', createdAt: r.createdAt };
  });
}
