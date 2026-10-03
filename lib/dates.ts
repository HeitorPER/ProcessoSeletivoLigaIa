export const TZ = 'America/Sao_Paulo';
export const MONTHS_PT = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const isoFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function toIsoDateSP(d: Date): string {
  return isoFormatter.format(d);
}

export function todaySP(now: Date = new Date()): string {
  return toIsoDateSP(now);
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTimeBR(d: Date): string {
  return dateTimeFormatter.format(d).replace(',', ' às');
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

export function dueInfo(due: string | null, today: string): { label: string; tone: 'none' | 'overdue' | 'soon' | 'ok' } {
  if (!due) return { label: 'A definir', tone: 'none' };
  const diff = daysBetween(today, due);
  if (diff < 0) return { label: `Vencida há ${-diff} ${-diff === 1 ? 'dia' : 'dias'}`, tone: 'overdue' };
  if (diff === 0) return { label: 'Vence hoje', tone: 'soon' };
  if (diff === 1) return { label: 'Vence amanhã', tone: 'soon' };
  return { label: `Vence em ${diff} dias`, tone: diff <= 3 ? 'soon' : 'ok' };
}
