'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export function DisconnectButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
    // A página mostra o aviso "Conta desconectada" (o botão some, pois já não há conta conectada).
    router.push('/sincronizacao?desconectado=1');
  }

  if (!confirming) {
    return (
      <div>
        <button type="button" onClick={() => { setError(''); setConfirming(true); }} className="btn btn-danger">Desconectar e limpar cache</button>
      </div>
    );
  }
  return (
    <div className="max-w-xl rounded-2xl bg-danger-soft p-4" role="group" aria-labelledby="desconectar-aviso">
      <p id="desconectar-aviso">Isso revoga o acesso no Google e apaga o texto extraído em cache. Atividades, sugestões e histórico permanecem.</p>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={disconnect} className="btn btn-danger-solid">{busy ? 'Desconectando…' : 'Confirmar desconexão'}</button>
        <button ref={cancelRef} type="button" onClick={() => { setConfirming(false); setError(''); }} className="btn btn-neutral">Cancelar</button>
      </div>
      {error && <p role="alert" className="mt-2 font-semibold text-danger">{error}</p>}
    </div>
  );
}
