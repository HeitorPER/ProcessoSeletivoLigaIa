'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ActivityStatus } from '@/lib/types';

export function ActivityStatusActions({ id, status }: { id: string; status: ActivityStatus }) {
  const router = useRouter();
  const [blocking, setBlocking] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/activities/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const b = res ? await res.json().catch(() => ({})) : {};
      setMessage({ tone: 'error', text: b.errors?.join(' ') ?? 'Sem conexão com o servidor.' });
      return;
    }
    setBlocking(false);
    setMessage({ tone: 'ok', text: done });
    router.refresh();
  }

  const btn = 'rounded border px-4 py-2 font-medium disabled:opacity-60';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status !== 'done' && <button type="button" disabled={busy} className={`${btn} border-ok text-ok`} onClick={() => patch({ status: 'done' }, 'Atividade marcada como concluída.')}>Marcar como concluída</button>}
        {status !== 'blocked' && status !== 'done' && <button type="button" disabled={busy} className={`${btn} border-danger text-danger`} aria-expanded={blocking} onClick={() => setBlocking((b) => !b)}>Bloquear</button>}
        {status === 'blocked' && <button type="button" disabled={busy} className={`${btn} border-line`} onClick={() => patch({ status: 'in_progress' }, 'Atividade desbloqueada.')}>Desbloquear (em andamento)</button>}
        {status === 'done' && <button type="button" disabled={busy} className={`${btn} border-line`} onClick={() => patch({ status: 'in_progress' }, 'Atividade reaberta.')}>Reabrir</button>}
      </div>
      {blocking && (
        <form onSubmit={(e) => { e.preventDefault(); if (reason.trim()) void patch({ status: 'blocked', blockedReason: reason }, 'Atividade bloqueada.'); }} className="max-w-xl rounded border border-line p-3">
          <label htmlFor="motivo-bloqueio" className="font-medium">Motivo do bloqueio (obrigatório)</label>
          <input id="motivo-bloqueio" required className="mt-1 block w-full rounded border border-line px-3 py-2" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="submit" disabled={busy || !reason.trim()} className="mt-2 rounded bg-danger px-4 py-2 font-semibold text-white disabled:opacity-60">Confirmar bloqueio</button>
        </form>
      )}
      <p role="status" className={message?.tone === 'error' ? 'text-danger' : 'text-ok'}>{message?.text ?? ''}</p>
    </div>
  );
}
