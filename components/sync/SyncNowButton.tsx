'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export function SyncNowButton() {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function run() {
    setBusy(true);
    setMsg('Pedido enviado — aguardando o sincronizador…');
    try {
      const res = await fetch('/api/sync/request', { method: 'POST' }).catch(() => null);
      const id: number | undefined = res?.ok ? await res.json().then((b) => b?.id, () => undefined) : undefined;
      if (id === undefined) {
        setMsg('Não foi possível pedir a sincronização (servidor indisponível).');
        return;
      }
      const started = Date.now();
      while (mounted.current && Date.now() - started < 180_000) {
        await new Promise((r) => setTimeout(r, 3000));
        if (!mounted.current) return;
        const s = await fetch(`/api/sync/status?id=${id}`).then((r) => r.json()).catch(() => null);
        if (!mounted.current) return;
        if (s?.handled) {
          setMsg(s.status === 'error' ? `Sincronização terminou com falha: ${s.lastError ?? 'veja abaixo'}` : s.status === 'auth_required' ? 'É preciso reconectar a conta Google.' : 'Sincronização concluída.');
          router.refresh();
          return;
        }
      }
      if (mounted.current) setMsg('O sincronizador não respondeu em 3 minutos. Confira se o worker está rodando (npm run dev inicia web + worker).');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={run} disabled={busy} className="btn btn-primary">{busy ? 'Sincronizando…' : 'Sincronizar agora'}</button>
      <p role="status" className="mt-1 text-sm">{msg}</p>
    </div>
  );
}
