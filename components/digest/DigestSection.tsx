import Link from 'next/link';
import type { DigestItem } from '@/lib/summary/digest';
import { formatDateTimeBR } from '@/lib/dates';

export function DigestSection({ id, title, hint, items, empty }: { id: string; title: string; hint: string; items: DigestItem[]; empty: string }) {
  return (
    <section aria-labelledby={id} className="card mt-6">
      <h2 id={id} className="text-xl font-semibold">{title} <span className="text-base font-normal text-muted">({items.length})</span></h2>
      <p className="text-sm text-muted">{hint}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-muted">{empty}</p>
      ) : (
        <ul className="card-list mt-3">
          {items.map((i) => (
            <li key={i.key} className="py-3 last:pb-0">
              <p className="font-semibold">{i.title}{i.tag && <span className="pill ml-2 bg-tint text-ink">{i.tag}</span>}</p>
              <p>{i.detail}</p>
              <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
                {i.at && <time dateTime={i.at.toISOString()} className="text-muted">{formatDateTimeBR(i.at)}</time>}
                {i.links.map((l) =>
                  l.external ? (
                    <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="text-brand underline">{l.label}<span className="sr-only"> (abre no Google Drive)</span></a>
                  ) : (
                    <Link key={l.href} href={l.href} className="text-brand underline">{l.label}</Link>
                  ),
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
