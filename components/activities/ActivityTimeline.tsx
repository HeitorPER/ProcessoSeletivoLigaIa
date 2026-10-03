import { SourceLink } from '@/components/ui/SourceLink';
import type { ActivityEventView } from '@/lib/activities/queries';
import { formatDateTimeBR } from '@/lib/dates';

const TYPE_LABELS: Record<string, string> = { import: 'Importação', create: 'Criação', update: 'Edição', status: 'Mudança de estado', suggestion_applied: 'Sugestão aplicada' };

export function ActivityTimeline({ events }: { events: ActivityEventView[] }) {
  if (!events.length) return <p className="text-muted">Sem histórico.</p>;
  return (
    <ol className="space-y-4 border-l-2 border-line pl-4">
      {events.map((e) => (
        <li key={e.id}>
          <p className="text-sm text-muted">
            <time dateTime={e.timestamp.toISOString()}>{formatDateTimeBR(e.timestamp)}</time> · {e.actorName} · {TYPE_LABELS[e.type] ?? e.type}
          </p>
          <ul className="list-disc pl-5">{e.changes.map((c) => <li key={c}>{c}</li>)}</ul>
          {e.reason && <p className="text-sm">Motivo: {e.reason}</p>}
          {e.source && <p className="text-sm">Fonte: <SourceLink name={e.source.name} href={e.source.webUrl} syncStatus={e.source.syncStatus} /></p>}
        </li>
      ))}
    </ol>
  );
}
