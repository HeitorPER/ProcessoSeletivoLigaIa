import { NextResponse } from 'next/server';
import { activityInputSchema, toActivityFields, zodErrors } from '@/lib/activities/input';
import { createActivity, ValidationError } from '@/lib/activities/service';
import { getCurrentMember } from '@/lib/session';

export async function POST(req: Request) {
  const actor = await getCurrentMember();
  const parsed = activityInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ errors: zodErrors(parsed.error) }, { status: 400 });
  const fields = toActivityFields(parsed.data);
  if (fields.status === 'blocked' && !fields.blockedReason) return NextResponse.json({ errors: ['Informe o motivo do bloqueio'] }, { status: 400 });
  try {
    const created = await createActivity(fields, actor.id, { origin: 'manual', reason: parsed.data.reason || 'Criada manualmente na Central' });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ errors: e.errors }, { status: 400 });
    throw e;
  }
}
