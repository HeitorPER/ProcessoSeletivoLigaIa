import { NextResponse } from 'next/server';
import { disconnectGoogle } from '@/lib/google/oauth';

export async function POST() {
  await disconnectGoogle();
  return NextResponse.json({ ok: true });
}
