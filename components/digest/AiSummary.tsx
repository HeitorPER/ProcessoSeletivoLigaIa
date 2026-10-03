'use client';
import { useEffect, useState } from 'react';

export function AiSummary({ since, enabled }: { since: string; enabled: boolean }) {
  const [state, setState] = useState<{ status: 'loading' | 'done' | 'error'; text: string | null }>({ status: 'loading', text: null });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch('/api/digest/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ since }) })
      .then((r) => r.json())
      .then((b) => !cancelled && setState({ status: b.summary ? 'done' : 'error', text: b.summary ?? null }))
      .catch(() => !cancelled && setState({ status: 'error', text: null }));
    return () => { cancelled = true; };
  }, [since, enabled]);

  if (!enabled) return <p className="text-sm text-muted">Resumo por IA desativado — os itens abaixo vêm diretamente dos registros.</p>;
  return (
    <section aria-labelledby="resumo-ia" className="rounded border-l-4 border-accent bg-surface px-4 py-3">
      <h2 id="resumo-ia" className="text-sm font-semibold uppercase tracking-wide text-muted">Resumo gerado por IA — confira nos itens abaixo</h2>
      <p aria-live="polite" className="mt-1">
        {state.status === 'loading' && 'Gerando resumo…'}
        {state.status === 'done' && state.text}
        {state.status === 'error' && 'Resumo por IA indisponível agora. Os itens abaixo continuam corretos.'}
      </p>
    </section>
  );
}
