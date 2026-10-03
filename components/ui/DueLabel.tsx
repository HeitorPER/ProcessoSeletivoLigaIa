import { dueInfo, formatDateBR } from '@/lib/dates';
import type { ActivityStatus } from '@/lib/types';

const TONE: Record<string, string> = { overdue: 'font-semibold text-danger', soon: 'font-semibold text-warn', ok: 'text-muted', none: 'text-muted' };

export function DueLabel({ dueDate, today, status }: { dueDate: string | null; today: string; status?: ActivityStatus }) {
  if (!dueDate) return <span className="italic text-muted">A definir</span>;
  const info = dueInfo(dueDate, today);
  return (
    <span className="whitespace-nowrap">
      <time dateTime={dueDate}>{formatDateBR(dueDate)}</time>
      {status !== 'done' && <span className={TONE[info.tone]}> · {info.label}</span>}
    </span>
  );
}
