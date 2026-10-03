import { NextResponse } from 'next/server';
import { activityPatchSchema, blockedReasonError, normalizeBlocked, toActivityPatch, zodErrors } from '@/lib/activities/input';
import { getActivitySnapshot, NotFoundError, updateActivity, ValidationError } from '@/lib/activities/service';
import { getCurrentMember } from '@/lib/session';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await getCurrentMember();
  const parsed = activityPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ errors: zodErrors(parsed.error) }, { status: 400 });
  const current = await getActivitySnapshot(id);
  if (!current) return NextResponse.json({ errors: [`Atividade ${id} não encontrada`] }, { status: 404 });
  const patch = normalizeBlocked(toActivityPatch(parsed.data));
  const blockedError = blockedReasonError(current, patch);
  if (blockedError) return NextResponse.json({ errors: [blockedError] }, { status: 400 });
  try {
    const r = await updateActivity(id, patch, actor.id, { reason: parsed.data.reason || undefined });
    return NextResponse.json({ id, changedFields: r.changedFields });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ errors: [e.message] }, { status: 404 });
    if (e instanceof ValidationError) return NextResponse.json({ errors: e.errors }, { status: 400 });
    throw e;
  }
}
