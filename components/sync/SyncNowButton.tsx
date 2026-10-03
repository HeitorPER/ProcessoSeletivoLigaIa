'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SyncNowButton() {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    setMsg('Pedido enviado — aguardando o sincronizador…');
    const res = await fetch('/api/sync/request', { method: 'POST' }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      setMsg('Não foi possível pedir a sincronização (servidor indisponível).');
      return;
    }
    const { id } = await res.json();
    const started = Date.now();
    while (Date.now() - started < 180_000) {
      await new Promise((r) => setTimeout(r, 3000));
      const s = await fetch(`/api/sync/status?id=${id}`).then((r) => r.json()).catch(() => null);
      if (s?.handled) {
        setMsg(s.status === 'error' ? `Sincronização terminou com falha: ${s.lastError ?? 'veja abaixo'}` : s.status === 'auth_required' ? 'É preciso reconectar a conta Google.' : 'Sincronização concluída.');
        setBusy(false);
        router.refresh();
        return;
      }
    }
    setBusy(false);
    setMsg('O sincronizador não respondeu em 3 minutos. Confira se o worker está rodando (npm run dev inicia web + worker).');
  }
  return (
    <div>
      <button type="button" onClick={run} disabled={busy} className="rounded bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">{busy ? 'Sincronizando…' : 'Sincronizar agora'}</button>
      <p role="status" className="mt-1 text-sm">{msg}</p>
    </div>
  );
}
