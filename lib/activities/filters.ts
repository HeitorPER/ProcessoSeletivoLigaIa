import { ACTIVITY_STATUSES, FRONTS, type ActivityStatus } from '@/lib/types';
import type { ActivityFilter, DueFilter } from './queries';

export interface FilterValues {
  responsavel: string;
  frente: string;
  estado: string;
  prazo: string;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const DUE: DueFilter[] = ['all', 'overdue', 'week', 'none'];

export function parseFilter(sp: Record<string, string | string[] | undefined>, fixedOwnerId?: string): { filter: ActivityFilter; values: FilterValues } {
  const responsavel = fixedOwnerId ?? (/^U-[A-Z0-9]+$/.test(first(sp.responsavel)) ? first(sp.responsavel) : '');
  const frente = (FRONTS as readonly string[]).includes(first(sp.frente)) ? first(sp.frente) : '';
  const estadoRaw = first(sp.estado);
  const estado = estadoRaw === 'all' || (ACTIVITY_STATUSES as readonly string[]).includes(estadoRaw) ? estadoRaw : 'open';
  const prazo = (DUE as string[]).includes(first(sp.prazo)) ? first(sp.prazo) : 'all';
  const filter: ActivityFilter = { status: estado as ActivityStatus | 'open' | 'all', due: prazo as DueFilter };
  if (responsavel) filter.ownerId = responsavel;
  if (frente) filter.front = frente;
  return { filter, values: { responsavel, frente, estado, prazo } };
}
