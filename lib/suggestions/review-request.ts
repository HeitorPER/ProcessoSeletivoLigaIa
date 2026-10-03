import { z } from 'zod';
import { reviewSuggestion } from '@/lib/activities/review';
import { analyzeUnauthorizedSheet } from '@/lib/ingest';
import { ACTIVITY_STATUSES, FRONTS, type ActivityPatch } from '@/lib/types';

const adjustFields = z
  .object({
    title: z.string().trim().min(1).max(200),
    nextStep: z.string().trim().max(500).nullable(),
    dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]),
    ownerIds: z.array(z.string()),
    front: z.union([z.enum(FRONTS), z.literal(''), z.null()]),
    status: z.enum(ACTIVITY_STATUSES),
  })
  .partial();

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('adjust'), fields: adjustFields }),
  z.object({ action: z.literal('reject'), note: z.string() }),
]);

const STATUS = { not_found: 404, already_reviewed: 409, forbidden: 403, invalid: 400 } as const;

export const ANALYSIS_FAILED_MESSAGE = 'A revisão foi registrada, mas a análise da planilha falhou; tente novamente mais tarde.';

export interface ReviewResponse {
  status: number;
  body: Record<string, unknown>;
}

/** Núcleo da rota de revisão: valida, aplica a decisão e, se for conflito de fonte aceito, analisa a planilha. */
export async function handleReviewRequest(suggestionId: string, reviewerId: string, body: unknown): Promise<ReviewResponse> {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: 'Pedido inválido' } };

  const decision =
    parsed.data.action === 'adjust'
      ? {
          action: 'adjust' as const,
          fields: Object.fromEntries(Object.entries(parsed.data.fields).map(([k, v]) => [k, v === '' ? null : v])) as ActivityPatch,
        }
      : parsed.data;

  const result = await reviewSuggestion(suggestionId, reviewerId, decision);
  if (!result.ok) return { status: STATUS[result.error], body: { error: result.message, code: result.error } };

  if (result.followUp !== 'analyze_sheet') {
    return { status: 200, body: { ok: true, status: result.status, activityId: result.activityId, analyzed: null } };
  }
  try {
    const analyzed = await analyzeUnauthorizedSheet(result.sourceFileId);
    return { status: 200, body: { ok: true, status: result.status, activityId: result.activityId, analyzed } };
  } catch (e) {
    console.error('Falha ao analisar a planilha após a revisão', e);
    return { status: 200, body: { ok: true, status: result.status, activityId: result.activityId, analyzed: null, analysisError: ANALYSIS_FAILED_MESSAGE } };
  }
}
