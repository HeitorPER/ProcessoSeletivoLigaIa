'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export function DisconnectButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  async function disconnect() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/google/disconnect', { method: 'POST' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError('Não foi possível desconectar. Tente de novo.');
      return;
    }
    setConfirming(false);
    setDone('Conta desconectada e cache apagado.');
    router.refresh();
  }

  if (!confirming) {
    return (
      <div>
        <button type="button" onClick={() => { setDone(''); setError(''); setConfirming(true); }} className="rounded border border-danger px-4 py-2 font-semibold text-danger">Desconectar e limpar cache</button>
        <p role="status" className="mt-1 text-sm">{done}</p>
      </div>
    );
  }
  return (
    <div className="max-w-xl rounded border border-danger p-3" role="group" aria-labelledby="desconectar-aviso">
      <p id="desconectar-aviso">Isso revoga o acesso no Google e apaga o texto extraído em cache. Atividades, sugestões e histórico permanecem.</p>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={disconnect} className="rounded bg-danger px-4 py-2 font-semibold text-white disabled:opacity-60">{busy ? 'Desconectando…' : 'Confirmar desconexão'}</button>
        <button ref={cancelRef} type="button" onClick={() => { setConfirming(false); setError(''); }} className="rounded border border-line px-4 py-2">Cancelar</button>
      </div>
      {error && <p role="alert" className="mt-2 font-semibold text-danger">{error}</p>}
    </div>
  );
}
