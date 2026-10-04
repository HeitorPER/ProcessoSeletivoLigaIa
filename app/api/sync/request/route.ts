import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentMember } from '@/lib/session';

export async function POST() {
  const member = await getCurrentMember();
  const req = await prisma.syncRequest.create({ data: { requestedBy: member.id } });
  return NextResponse.json({ id: req.id }, { status: 202 });
}
