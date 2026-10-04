import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exchangeCode } from '@/lib/google/oauth';
import { OAUTH_STATE_COOKIE, readCookie, sameState } from '@/lib/google/state';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/sincronizacao?${q}`, req.url));
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  };
  if (url.searchParams.get('error')) return back('erro=negado');
  const cookieState = readCookie(req.headers.get('cookie'), OAUTH_STATE_COOKIE);
  if (!sameState(cookieState, url.searchParams.get('state'))) return back('erro=state');
  const code = url.searchParams.get('code');
  if (!code) return back('erro=troca');
  try {
    await exchangeCode(code);
  } catch (e) {
    console.error('[oauth] falha ao concluir a conexão:', (e as Error).message); // nunca logar o código
    return back('erro=troca');
  }
  try {
    await prisma.syncRequest.create({ data: { requestedBy: 'sistema' } });
  } catch (e) {
    // o token já foi salvo; o worker sincroniza no próximo ciclo mesmo sem o pedido imediato
    console.error('[oauth] conectado, mas não foi possível pedir a primeira sincronização:', (e as Error).message);
  }
  return back('conectado=1');
}
