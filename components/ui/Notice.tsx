const TONES = {
  info: { cls: 'border-brand bg-surface text-ink', prefix: 'Informação' },
  ok: { cls: 'border-ok bg-ok-soft text-ink', prefix: 'Pronto' },
  warn: { cls: 'border-warn bg-warn-soft text-ink', prefix: 'Atenção' },
  error: { cls: 'border-danger bg-danger-soft text-ink', prefix: 'Erro' },
} as const;

export function Notice({ tone = 'info', title, live = false, children }: { tone?: keyof typeof TONES; title?: string; live?: boolean; children?: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <div role={live ? (tone === 'error' ? 'alert' : 'status') : undefined} className={`my-3 rounded border-l-4 px-4 py-3 ${t.cls}`}>
      <p className="font-semibold">
        <span className="sr-only">{t.prefix}: </span>
        {title ?? t.prefix}
      </p>
      {children && <div className="mt-1 text-[15px]">{children}</div>}
    </div>
  );
}
