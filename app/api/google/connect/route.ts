import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildAuthUrl, isGoogleConfigured } from '@/lib/google/oauth';
import { OAUTH_STATE_COOKIE } from '@/lib/google/state';

export async function GET(req: Request) {
  if (!isGoogleConfigured()) return NextResponse.redirect(new URL('/sincronizacao?erro=config', req.url));
  const state = randomBytes(24).toString('base64url');
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set(OAUTH_STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600, secure: process.env.NODE_ENV === 'production' });
  return res;
}
