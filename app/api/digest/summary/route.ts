import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProvider } from '@/lib/ai';
import { RULES_PROVIDER_NAME } from '@/lib/ai/rules';
import { getCurrentMember } from '@/lib/session';
import { buildDigest, summarizeDigest } from '@/lib/summary/digest';

const body = z.object({ since: z.iso.datetime() });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Período inválido' }, { status: 400 });
  const provider = getProvider();
  if (provider.name === RULES_PROVIDER_NAME) return NextResponse.json({ summary: null, reason: 'disabled' });
  const member = await getCurrentMember();
  const digest = await buildDigest(member.id, new Date(parsed.data.since));
  const summary = await summarizeDigest(digest, member.displayName, provider);
  return NextResponse.json({ summary, reason: summary ? null : 'unavailable', provider: provider.name });
}
