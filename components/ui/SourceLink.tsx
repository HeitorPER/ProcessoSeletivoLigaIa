export function SourceLink({ name, href, syncStatus }: { name: string; href: string; syncStatus?: string }) {
  const unavailable = syncStatus === 'unavailable' || syncStatus === 'error';
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2 hover:text-brand-dark">
        {name}
        <span aria-hidden="true"> ↗</span>
        <span className="sr-only"> (abre no Google Drive em nova aba)</span>
      </a>
      {unavailable && <span className="rounded bg-warn-soft px-1 text-sm font-medium text-warn">{syncStatus === 'error' ? 'com erro' : 'indisponível'}</span>}
    </span>
  );
}
