import { formatDateTimeBR } from '@/lib/dates';

export type Period = 'visita' | '7d' | '30d';
const DAY = 86_400_000;

export function resolvePeriod(raw: string | undefined, now: Date, lastVisit: Date | null): { period: Period; since: Date; label: string } {
  const period: Period = raw === '7d' || raw === '30d' ? raw : 'visita';
  if (period === '7d') return { period, since: new Date(now.getTime() - 7 * DAY), label: 'nos últimos 7 dias' };
  if (period === '30d') return { period, since: new Date(now.getTime() - 30 * DAY), label: 'nos últimos 30 dias' };
  if (lastVisit) return { period, since: lastVisit, label: `desde sua última visita (${formatDateTimeBR(lastVisit)})` };
  return { period, since: new Date(now.getTime() - 7 * DAY), label: 'nos últimos 7 dias (primeira visita registrada)' };
}
