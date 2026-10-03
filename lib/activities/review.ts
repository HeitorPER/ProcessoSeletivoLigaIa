import { emptyFields } from '@/lib/activity-fields';
import { prisma } from '@/lib/db';
import { parseJson } from '@/lib/json';
import { canReview, loadMembers } from '@/lib/members';
import { REVIEW_STATUS_LABELS, type ActivityFields, type ActivityPatch, type ReviewStatus } from '@/lib/types';
import { createActivity, updateActivity, ValidationError } from './service';

export type ReviewDecision = { action: 'accept' } | { action: 'adjust'; fields: ActivityPatch } | { action: 'reject'; note: string };
export type ReviewResult =
  | { ok: true; status: ReviewStatus; activityId: string | null; followUp: 'analyze_sheet' | null; sourceFileId: string }
  | { ok: false; error: 'not_found' | 'already_reviewed' | 'forbidden' | 'invalid'; message: string };

type Failure = Extract<ReviewResult, { ok: false }>;
const fail = (error: Failure['error'], message: string): ReviewResult => ({ ok: false, error, message });

export async function reviewSuggestion(suggestionId: string, reviewerId: string, decision: ReviewDecision): Promise<ReviewResult> {
  try {
    return await prisma.$transaction(async (db) => {
      const s = await db.suggestion.findUnique({ where: { id: suggestionId } });
      if (!s) return fail('not_found', 'Sugestão não encontrada');
      if (s.reviewStatus !== 'pending') {
        return fail('already_reviewed', `Esta sugestão já foi revisada (${REVIEW_STATUS_LABELS[s.reviewStatus as ReviewStatus] ?? s.reviewStatus})`);
      }
      const members = await loadMembers(db);
      const reviewer = members.find((m) => m.id === reviewerId);
      if (!reviewer || !canReview(reviewer, s.front, members)) return fail('forbidden', 'Você não pode revisar sugestões desta frente');
      if (decision.action === 'reject' && !decision.note.trim()) return fail('invalid', 'Informe o motivo da rejeição');
      if (decision.action === 'adjust' && s.kind === 'source_conflict') return fail('invalid', 'Conflitos de fonte só podem ser aceitos (analisar) ou rejeitados (descartar)');

      const status: ReviewStatus = decision.action === 'reject' ? 'rejected' : decision.action === 'adjust' ? 'adjusted' : 'accepted';
      const claimed = await db.suggestion.updateMany({
        where: { id: s.id, reviewStatus: 'pending' },
        data: { reviewStatus: status, reviewerId, reviewedAt: new Date(), reviewNote: decision.action === 'reject' ? decision.note.trim() : null },
      });
      if (claimed.count === 0) return fail('already_reviewed', 'Esta sugestão já foi revisada');

      const done = (activityId: string | null, followUp: 'analyze_sheet' | null = null): ReviewResult => ({ ok: true, status, activityId, followUp, sourceFileId: s.sourceFileId });
      if (status === 'rejected') return done(null);
      if (s.kind === 'source_conflict') return done(null, 'analyze_sheet');

      const proposed = parseJson<ActivityPatch>(s.proposedFields, {});
      const fields: ActivityPatch = decision.action === 'adjust' ? { ...proposed, ...decision.fields } : proposed;
      const reason = `${status === 'adjusted' ? 'Sugestão ajustada e aceita' : 'Sugestão aceita'}: ${s.reason}`;
      const reference = { fileId: s.sourceFileId, versionOrHash: s.sourceVersion, sheetOrSection: s.evidenceLocator, quoteOrCell: s.evidence };

      if (s.kind === 'create') {
        const idFree = s.proposedId && !(await db.activity.findUnique({ where: { id: s.proposedId } }));
        const created = await createActivity({ ...emptyFields(), ...fields } as ActivityFields, reviewerId, {
          id: idFree ? s.proposedId! : undefined, origin: 'suggestion', reason, sourceFileId: s.sourceFileId, suggestionId: s.id, db,
        });
        await db.reference.create({ data: { activityId: created.id, relationType: 'created_by', ...reference } });
        await db.suggestion.update({ where: { id: s.id }, data: { resultActivityId: created.id } });
        return done(created.id);
      }

      await updateActivity(s.targetActivityId!, fields, reviewerId, { type: 'suggestion_applied', reason, sourceFileId: s.sourceFileId, suggestionId: s.id, db });
      await db.reference.create({ data: { activityId: s.targetActivityId!, relationType: 'updated_by', ...reference } });
      await db.suggestion.update({ where: { id: s.id }, data: { resultActivityId: s.targetActivityId } });
      return done(s.targetActivityId);
    });
  } catch (e) {
    if (e instanceof ValidationError) return fail('invalid', e.message);
    throw e;
  }
}
