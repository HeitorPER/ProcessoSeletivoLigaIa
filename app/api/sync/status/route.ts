import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get('id'));
  const [request, state] = await Promise.all([
    Number.isInteger(id) ? prisma.syncRequest.findUnique({ where: { id } }) : null,
    prisma.syncState.findUnique({ where: { id: 1 } }),
  ]);
  return NextResponse.json({
    handled: Boolean(request?.handledAt),
    status: state?.status ?? 'idle',
    lastSuccessAt: state?.lastSuccessAt ?? null,
    lastError: state?.lastError ?? null,
  });
}
