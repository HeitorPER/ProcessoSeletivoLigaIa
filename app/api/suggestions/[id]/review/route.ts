import { NextResponse } from 'next/server';
import { z } from 'zod';
import { reviewSuggestion } from '@/lib/activities/review';
import { analyzeUnauthorizedSheet } from '@/lib/ingest';
import { getCurrentMember } from '@/lib/session';
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

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('adjust'), fields: adjustFields }),
  z.object({ action: z.literal('reject'), note: z.string() }),
]);

const STATUS = { not_found: 404, already_reviewed: 409, forbidden: 403, invalid: 400 } as const;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const reviewer = await getCurrentMember();
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  const decision =
    parsed.data.action === 'adjust'
      ? {
          action: 'adjust' as const,
          fields: Object.fromEntries(
            Object.entries(parsed.data.fields).map(([k, v]) => [k, v === '' ? null : v]),
          ) as ActivityPatch,
        }
      : parsed.data;

  const result = await reviewSuggestion(id, reviewer.id, decision);
  if (!result.ok) return NextResponse.json({ error: result.message, code: result.error }, { status: STATUS[result.error] });
  const analyzed = result.followUp === 'analyze_sheet' ? await analyzeUnauthorizedSheet(result.sourceFileId) : null;
  return NextResponse.json({ ok: true, status: result.status, activityId: result.activityId, analyzed });
}
