import { REVIEW_STATUS_LABELS, type ReviewStatus } from '@/lib/types';

const STYLES: Record<ReviewStatus, string> = {
  pending: 'bg-brand-soft text-brand',
  accepted: 'bg-ok-soft text-ok',
  adjusted: 'bg-ok-soft text-ok',
  rejected: 'bg-danger-soft text-danger',
  superseded: 'bg-tint text-muted',
};

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return <span className={`pill ${STYLES[status]}`}>{REVIEW_STATUS_LABELS[status]}</span>;
}
