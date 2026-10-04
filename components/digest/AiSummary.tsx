'use client';
import { useEffect, useState } from 'react';

interface Result { since: string; status: 'done' | 'error'; text: string | null }

export function AiSummary({ since, enabled }: { since: string; enabled: boolean }) {
  // O resultado guarda o período a que pertence: ao mudar `since`, volta a "carregando" sem setState no corpo do efeito.
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch('/api/digest/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ since }) })
      .then((r) => r.json())
      .then((b) => !cancelled && setResult({ since, status: b.summary ? 'done' : 'error', text: b.summary ?? null }))
      .catch(() => !cancelled && setResult({ since, status: 'error', text: null }));
    return () => { cancelled = true; };
  }, [since, enabled]);

  if (!enabled) return <p className="text-sm text-muted">Resumo por IA desativado — os itens abaixo vêm diretamente dos registros.</p>;
  const current = result?.since === since ? result : null;
  return (
    <section aria-labelledby="resumo-ia" className="card">
      <h2 id="resumo-ia"><span className="pill whitespace-normal bg-accent-soft text-ink">Resumo gerado por IA — confira nos itens abaixo</span></h2>
      <p aria-live="polite" className="mt-3">
        {!current && 'Gerando resumo…'}
        {current?.status === 'done' && current.text}
        {current?.status === 'error' && 'Resumo por IA indisponível agora. Os itens abaixo continuam corretos.'}
      </p>
    </section>
  );
}
