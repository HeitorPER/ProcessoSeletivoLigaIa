import { DriveError } from './types';

const RATE_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'sharingRateLimitExceeded', 'backendError']);
/** Cotas que não se renovam em segundos (diária, de download): não vale repetir agora, mas não é falta de acesso. */
const QUOTA_REASONS = new Set(['dailyLimitExceeded', 'quotaExceeded', 'downloadQuotaExceeded']);
const NET_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED']);

export function isRetryable(e: unknown): boolean {
  if (e instanceof DriveError) return e.status === 429 || e.status >= 500 || (e.status === 403 && RATE_REASONS.has(e.reason ?? ''));
  const code = (e as { code?: string })?.code;
  return typeof code === 'string' && NET_CODES.has(code);
}

/** Erro passageiro (limite de taxa, cota, falha do servidor ou de rede): nunca significa "sem acesso ao arquivo". */
export function isTemporaryDriveError(e: unknown): boolean {
  return isRetryable(e) || (e instanceof DriveError && e.status === 403 && QUOTA_REASONS.has(e.reason ?? ''));
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Espera progressiva 2s, 4s, 8s, 16s, 32s em erros temporários. */
export async function withRetry<T>(fn: () => Promise<T>, opts: { retries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const retries = opts.retries ?? 5;
  const baseMs = opts.baseMs ?? 2000;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= retries || !isRetryable(e)) throw e;
      await sleep(baseMs * 2 ** attempt);
    }
  }
}
