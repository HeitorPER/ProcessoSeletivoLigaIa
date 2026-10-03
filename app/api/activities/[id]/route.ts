import { NextResponse } from 'next/server';
import { activityPatchSchema, toActivityPatch, zodErrors } from '@/lib/activities/input';
import { getActivitySnapshot, NotFoundError, updateActivity, ValidationError } from '@/lib/activities/service';
import { getCurrentMember } from '@/lib/session';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await getCurrentMember();
  const parsed = activityPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ errors: zodErrors(parsed.error) }, { status: 400 });
  const patch = toActivityPatch(parsed.data);
  if (patch.status === 'blocked' && !patch.blockedReason) {
    const current = await getActivitySnapshot(id);
    if (!current?.blockedReason) return NextResponse.json({ errors: ['Informe o motivo do bloqueio'] }, { status: 400 });
  }
  if (patch.status && patch.status !== 'blocked') patch.blockedReason = null;
  try {
    const r = await updateActivity(id, patch, actor.id, { reason: parsed.data.reason || undefined });
    return NextResponse.json({ id, changedFields: r.changedFields });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ errors: [e.message] }, { status: 404 });
    if (e instanceof ValidationError) return NextResponse.json({ errors: e.errors }, { status: 400 });
    throw e;
  }
}
