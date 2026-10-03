import { NextResponse } from 'next/server';
import { loadMembers } from '@/lib/members';
import { MEMBER_COOKIE } from '@/lib/session';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { memberId?: string } | null;
  const member = (await loadMembers()).find((m) => m.id === body?.memberId);
  if (!member) return NextResponse.json({ error: 'Membro desconhecido' }, { status: 400 });
  const res = NextResponse.json({ ok: true, member: { id: member.id, displayName: member.displayName } });
  res.cookies.set(MEMBER_COOKIE, member.id, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
  return res;
}
