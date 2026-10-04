import Link from 'next/link';
import { DueLabel } from '@/components/ui/DueLabel';
import { SourceLink } from '@/components/ui/SourceLink';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { ActivityListItem } from '@/lib/activities/queries';

function Owners({ a }: { a: ActivityListItem }) {
  return a.owners.length ? <>{a.owners.map((o) => o.displayName).join(', ')}</> : <span className="italic text-muted">Responsável a confirmar</span>;
}

function Flags({ a }: { a: ActivityListItem }) {
  return (
    <>
      {a.pendingSuggestions > 0 && (
        <Link href="/sugestoes" className="mt-1 block text-sm font-medium text-brand underline">
          <span aria-hidden="true">↻ </span>Atualização proposta pendente ({a.pendingSuggestions})
        </Link>
      )}
      {a.hasStaleSource && (
        <span className="mt-1 block text-sm font-medium text-warn">
          <span aria-hidden="true">▲ </span>
          {a.staleReason === 'error' ? 'Fonte com erro de leitura — dado pode estar desatualizado' : 'Fonte indisponível — dado pode estar desatualizado'}
        </span>
      )}
    </>
  );
}

function Source({ a }: { a: ActivityListItem }) {
  const s = a.sources[0];
  if (!s) return <span className="text-sm text-muted">Criada na Central</span>;
  return <SourceLink name={s.name} href={s.webUrl} syncStatus={s.syncStatus} />;
}

export function ActivityList({ items, today }: { items: ActivityListItem[]; today: string }) {
  return (
    <>
      <table className="hidden w-full border-collapse text-left md:table">
        <caption className="sr-only">Atividades, ordenadas por prazo</caption>
        <thead>
          <tr className="border-b-2 border-ink text-sm">
            <th scope="col" className="py-2 pr-3">Atividade</th>
            <th scope="col" className="py-2 pr-3">Responsáveis</th>
            <th scope="col" className="py-2 pr-3">Frente</th>
            <th scope="col" className="py-2 pr-3">Estado</th>
            <th scope="col" className="py-2 pr-3">Prazo</th>
            <th scope="col" className="py-2 pr-3">Próximo passo</th>
            <th scope="col" className="py-2">Fonte</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id} className="border-b border-line align-top">
              <td className="py-3 pr-3">
                <Link href={`/atividades/${a.id}`} className="font-semibold text-brand underline-offset-2 hover:underline">{a.title}</Link>
                <span className="block text-sm text-muted">{a.id}</span>
                <Flags a={a} />
              </td>
              <td className="py-3 pr-3"><Owners a={a} /></td>
              <td className="py-3 pr-3">{a.front ?? <span className="text-muted">—</span>}</td>
              <td className="py-3 pr-3"><StatusBadge status={a.status} /></td>
              <td className="py-3 pr-3"><DueLabel dueDate={a.dueDate} today={today} status={a.status} /></td>
              <td className="py-3 pr-3">{a.nextStep ?? <span className="italic text-muted">a definir</span>}</td>
              <td className="py-3"><Source a={a} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="space-y-3 md:hidden">
        {items.map((a) => (
          <li key={a.id} className="rounded border border-line p-4">
            <Link href={`/atividades/${a.id}`} className="text-lg font-semibold text-brand underline">{a.title}</Link>
            <p className="text-sm text-muted">{a.id}{a.front ? ` · ${a.front}` : ''}</p>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 [overflow-wrap:anywhere]">
              <dt className="font-medium">Responsáveis</dt><dd><Owners a={a} /></dd>
              <dt className="font-medium">Prazo</dt><dd><DueLabel dueDate={a.dueDate} today={today} status={a.status} /></dd>
              <dt className="font-medium">Estado</dt><dd><StatusBadge status={a.status} /></dd>
              <dt className="font-medium">Próximo passo</dt><dd>{a.nextStep ?? <span className="italic text-muted">a definir</span>}</dd>
              <dt className="font-medium">Fonte</dt><dd><Source a={a} /></dd>
            </dl>
            <Flags a={a} />
          </li>
        ))}
      </ul>
    </>
  );
}
