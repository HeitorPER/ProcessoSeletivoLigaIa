import { STATUS_LABELS, type ActivityStatus } from '@/lib/types';

const STYLES: Record<ActivityStatus, { cls: string; icon: string }> = {
  todo: { cls: 'bg-tint text-ink', icon: '○' },
  in_progress: { cls: 'bg-accent-soft text-ink', icon: '◐' },
  blocked: { cls: 'bg-danger-soft text-danger', icon: '■' },
  done: { cls: 'bg-ok-soft text-ok', icon: '✓' },
};

export function StatusBadge({ status }: { status: ActivityStatus }) {
  const s = STYLES[status];
  return (
    <span className={`pill ${s.cls}`}>
      <span aria-hidden="true">{s.icon}</span>
      {STATUS_LABELS[status]}
    </span>
  );
}
