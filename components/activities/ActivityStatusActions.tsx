'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ActivityStatus } from '@/lib/types';

export function ActivityStatusActions({ id, status }: { id: string; status: ActivityStatus }) {
  const router = useRouter();
  const [blocking, setBlocking] = useState(false);
  const [reason, setReason] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reasonRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (blocking) reasonRef.current?.focus();
  }, [blocking]);

  async function patch(body: Record<string, unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setSuccess('');
    setError('');
    const res = await fetch(`/api/activities/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!res) {
      setError('Sem conexão com o servidor. Tente novamente.');
      return false;
    }
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setError(Array.isArray(b?.errors) && b.errors.length ? b.errors.join(' ') : `Erro ao salvar (HTTP ${res.status})`);
      return false;
    }
    setSuccess(done);
    router.refresh();
    return true;
  }

  async function confirmBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    if (await patch({ status: 'blocked', blockedReason: reason }, 'Atividade bloqueada.')) {
      setBlocking(false);
      setReason('');
    }
  }

  const btn = 'btn';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status !== 'done' && <button type="button" disabled={busy} className={`${btn} btn-ok`} onClick={() => patch({ status: 'done' }, 'Atividade marcada como concluída.')}>Marcar como concluída</button>}
        {status !== 'blocked' && status !== 'done' && <button type="button" disabled={busy} className={`${btn} btn-danger`} aria-expanded={blocking} aria-controls="form-bloqueio" onClick={() => setBlocking((b) => !b)}>Bloquear</button>}
        {status === 'blocked' && <button type="button" disabled={busy} className={`${btn} btn-secondary`} onClick={() => patch({ status: 'in_progress' }, 'Atividade desbloqueada.')}>Desbloquear (em andamento)</button>}
        {status === 'done' && <button type="button" disabled={busy} className={`${btn} btn-secondary`} onClick={() => patch({ status: 'in_progress' }, 'Atividade reaberta.')}>Reabrir</button>}
      </div>
      {blocking && (
        <form id="form-bloqueio" onSubmit={confirmBlock} className="max-w-xl rounded-2xl bg-canvas p-4">
          <label htmlFor="motivo-bloqueio" className="font-medium">Motivo do bloqueio (obrigatório)</label>
          <input ref={reasonRef} id="motivo-bloqueio" required className="field mt-1 block w-full" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="submit" disabled={busy || !reason.trim()} className="btn btn-danger-solid mt-3">Confirmar bloqueio</button>
        </form>
      )}
      <p role="status" className="text-ok">{success}</p>
      <p role="alert" className="text-danger">{error}</p>
    </div>
  );
}
