'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DisconnectButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  async function disconnect() {
    setBusy(true);
    await fetch('/api/google/disconnect', { method: 'POST' }).catch(() => null);
    setBusy(false);
    setConfirming(false);
    router.refresh();
  }
  if (!confirming) return <button type="button" onClick={() => setConfirming(true)} className="rounded border border-danger px-4 py-2 font-semibold text-danger">Desconectar e limpar cache</button>;
  return (
    <div className="max-w-xl rounded border border-danger p-3" role="group" aria-labelledby="desconectar-aviso">
      <p id="desconectar-aviso">Isso revoga o acesso no Google e apaga o texto extraído em cache. Atividades, sugestões e histórico permanecem.</p>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={disconnect} className="rounded bg-danger px-4 py-2 font-semibold text-white disabled:opacity-60">Confirmar desconexão</button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded border border-line px-4 py-2">Cancelar</button>
      </div>
    </div>
  );
}
