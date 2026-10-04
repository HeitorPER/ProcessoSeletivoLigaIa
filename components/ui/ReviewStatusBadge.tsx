import { REVIEW_STATUS_LABELS, type ReviewStatus } from '@/lib/types';

const STYLES: Record<ReviewStatus, string> = {
  pending: 'border-accent bg-accent-soft text-ink',
  accepted: 'border-ok bg-ok-soft text-ok',
  adjusted: 'border-ok bg-ok-soft text-ok',
  rejected: 'border-danger bg-danger-soft text-danger',
  superseded: 'border-line bg-surface text-muted',
};

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-sm font-medium ${STYLES[status]}`}>{REVIEW_STATUS_LABELS[status]}</span>;
}
