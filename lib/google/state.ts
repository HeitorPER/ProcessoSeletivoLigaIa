import { timingSafeEqual } from 'node:crypto';

export const OAUTH_STATE_COOKIE = 'g_oauth_state';

/** Lê um cookie pelo nome exato do cabeçalho Cookie (não confunde com nomes que terminam igual). */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return header.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`))?.[1];
}

/** Compara o state do cookie com o da URL em tempo constante; false se faltar ou tiver tamanho diferente. */
export function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
