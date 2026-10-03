import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exchangeCode } from '@/lib/google/oauth';
import { OAUTH_STATE_COOKIE } from '@/lib/google/state';

function sameState(a: string | undefined, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/sincronizacao?${q}`, req.url));
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  };
  if (url.searchParams.get('error')) return back('erro=negado');
  const cookieState = req.headers.get('cookie')?.match(new RegExp(`${OAUTH_STATE_COOKIE}=([^;]+)`))?.[1];
  if (!sameState(cookieState, url.searchParams.get('state'))) return back('erro=state');
  const code = url.searchParams.get('code');
  if (!code) return back('erro=troca');
  try {
    await exchangeCode(code);
  } catch (e) {
    console.error('[oauth] falha ao concluir a conexão:', (e as Error).message); // nunca logar o código
    return back('erro=troca');
  }
  await prisma.syncRequest.create({ data: { requestedBy: 'sistema' } });
  return back('conectado=1');
}
