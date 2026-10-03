import { STATUS_LABELS, type ActivityStatus } from '@/lib/types';

const STYLES: Record<ActivityStatus, { cls: string; icon: string }> = {
  todo: { cls: 'border-line bg-white text-ink', icon: '○' },
  in_progress: { cls: 'border-accent bg-accent-soft text-ink', icon: '◐' },
  blocked: { cls: 'border-danger bg-danger-soft text-danger', icon: '■' },
  done: { cls: 'border-ok bg-ok-soft text-ok', icon: '✓' },
};

export function StatusBadge({ status }: { status: ActivityStatus }) {
  const s = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-sm font-medium ${s.cls}`}>
      <span aria-hidden="true">{s.icon}</span>
      {STATUS_LABELS[status]}
    </span>
  );
}
