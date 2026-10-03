import { formatDateTimeBR } from '@/lib/dates';

export interface SyncStateLike {
  status: string;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  workerHeartbeatAt: Date | null;
}

const HEARTBEAT_LIMIT_MS = 2 * 60_000;
const FRESH_LIMIT_MIN = 20;

export function describeSyncState({ state, connected, now }: { state: SyncStateLike | null; connected: boolean; now: Date }): { label: string; tone: 'ok' | 'warn' | 'error'; detail: string | null } {
  const last = state?.lastSuccessAt ?? null;
  const lastText = last ? `Último sucesso: ${formatDateTimeBR(last)}` : 'Nenhuma sincronização concluída ainda';
  if (!connected) return { label: 'Desconectado do Drive', tone: 'warn', detail: 'Conecte uma conta Google em “Estado da sincronização”.' };
  if (state?.status === 'auth_required') return { label: 'Reconexão com o Google necessária', tone: 'error', detail: 'O acesso expirou ou foi revogado. As atividades continuam disponíveis.' };
  if (!state?.workerHeartbeatAt || now.getTime() - state.workerHeartbeatAt.getTime() > HEARTBEAT_LIMIT_MS) {
    return { label: 'Sincronizador parado — dados podem estar desatualizados', tone: 'warn', detail: lastText };
  }
  if (state.status === 'error') {
    return { label: `Falha na sincronização — dados de ${last ? formatDateTimeBR(last) : 'nenhuma sincronização'}`, tone: 'error', detail: state.lastError };
  }
  if (state.status === 'running') return { label: 'Sincronizando…', tone: 'ok', detail: lastText };
  if (!last) return { label: 'Aguardando primeira sincronização', tone: 'warn', detail: null };
  const minutes = Math.floor((now.getTime() - last.getTime()) / 60_000);
  const label = minutes < 1 ? 'Sincronizado agora há pouco' : `Sincronizado há ${minutes} min`;
  return { label, tone: minutes <= FRESH_LIMIT_MIN ? 'ok' : 'warn', detail: lastText };
}
