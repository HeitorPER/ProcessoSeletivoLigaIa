import { NextResponse } from 'next/server';
import { getCurrentMember } from '@/lib/session';
import { handleReviewRequest } from '@/lib/suggestions/review-request';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const reviewer = await getCurrentMember();
  const out = await handleReviewRequest(id, reviewer.id, await req.json().catch(() => null));
  return NextResponse.json(out.body, { status: out.status });
}
