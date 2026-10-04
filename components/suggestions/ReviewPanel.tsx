'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ACTIVITY_STATUSES, FRONTS, STATUS_LABELS, type ActivityPatch, type MemberInfo, type SuggestionKind } from '@/lib/types';

type Mode = 'idle' | 'adjust' | 'reject';
type ReviewBody = { error?: string; code?: string; status?: string; analyzed?: number | null; analysisError?: string };
const input = 'mt-1 block w-full rounded border border-line bg-white px-3 py-2';

export function ReviewPanel({ id, kind, proposed, members, analysisBlocked = false }: { id: string; kind: SuggestionKind; proposed: ActivityPatch; members: MemberInfo[]; analysisBlocked?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  const [fields, setFields] = useState<ActivityPatch>(proposed);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adjustForm = useRef<HTMLFormElement>(null);
  const rejectForm = useRef<HTMLFormElement>(null);
  const conflict = kind === 'source_conflict';
  const keys: (keyof ActivityPatch)[] = kind === 'create' ? ['title', 'ownerIds', 'front', 'dueDate', 'nextStep', 'status'] : (Object.keys(proposed) as (keyof ActivityPatch)[]);

  // Ao abrir um formulário, o foco vai para o primeiro campo.
  useEffect(() => {
    const form = mode === 'adjust' ? adjustForm.current : mode === 'reject' ? rejectForm.current : null;
    form?.querySelector<HTMLElement>('input, select, textarea')?.focus();
  }, [mode]);

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch(`/api/suggestions/${id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch {
      setBusy(false);
      setError('Sem conexão com o servidor. Nada foi alterado.');
      return;
    }
    const body = (await res.json().catch(() => null)) as ReviewBody | null;
    // 409 "já revisada" volta para a lista; 409 de texto da planilha indisponível fica no cartão com a mensagem.
    if (res.status === 409 && body?.code !== 'source_unavailable') {
      router.push('/sugestoes?resultado=ja-revisada#lista');
      return;
    }
    if (!res.ok) {
      setBusy(false);
      setError(body?.error ?? `Erro no servidor (HTTP ${res.status}). Recarregue a página para ver o estado atual.`);
      return;
    }
    // O cartão some após a revisão; o aviso vai para a página pela URL.
    const q = new URLSearchParams({ resultado: body?.status ?? 'accepted' });
    if (typeof body?.analyzed === 'number') q.set('analisadas', String(body.analyzed));
    if (body?.analysisError) q.set('aviso', 'analise');
    router.push(`/sugestoes?${q.toString()}#lista`);
  }

  const set = (k: keyof ActivityPatch, v: unknown) => setFields((f) => ({ ...f, [k]: v }));
  const fid = (k: string) => `rev-${id}-${k}`;

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || analysisBlocked} aria-describedby={analysisBlocked ? fid('blocked') : undefined} onClick={() => send({ action: 'accept' })} className="rounded bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
          {conflict ? 'Analisar linhas como sugestões' : 'Aceitar'}
        </button>
        {!conflict && (
          <button type="button" disabled={busy} aria-expanded={mode === 'adjust'} aria-controls={fid('adjust')} onClick={() => setMode(mode === 'adjust' ? 'idle' : 'adjust')} className="rounded border border-brand px-4 py-2 font-semibold text-brand disabled:opacity-60">
            Ajustar e aceitar
          </button>
        )}
        <button type="button" disabled={busy} aria-expanded={mode === 'reject'} aria-controls={fid('reject')} onClick={() => setMode(mode === 'reject' ? 'idle' : 'reject')} className="rounded border border-danger px-4 py-2 font-semibold text-danger disabled:opacity-60">
          {conflict ? 'Descartar planilha' : 'Rejeitar'}
        </button>
      </div>
      {analysisBlocked && <p id={fid('blocked')} className="text-sm text-muted">Análise indisponível: a planilha não está mais na pasta. Só o descarte está liberado.</p>}

      {mode === 'adjust' && (
        <form id={fid('adjust')} ref={adjustForm} onSubmit={(e) => { e.preventDefault(); void send({ action: 'adjust', fields }); }} className="grid max-w-2xl gap-3 rounded border border-line p-4">
          {keys.includes('title') && <div><label htmlFor={fid('title')} className="font-medium">Título</label><input id={fid('title')} required className={input} value={fields.title ?? ''} onChange={(e) => set('title', e.target.value)} /></div>}
          {keys.includes('nextStep') && <div><label htmlFor={fid('nextStep')} className="font-medium">Próximo passo</label><input id={fid('nextStep')} className={input} value={fields.nextStep ?? ''} onChange={(e) => set('nextStep', e.target.value || null)} /></div>}
          {keys.includes('dueDate') && <div><label htmlFor={fid('dueDate')} className="font-medium">Prazo (vazio = a definir)</label><input id={fid('dueDate')} type="date" className={input} value={fields.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || null)} /></div>}
          {keys.includes('front') && (
            <div><label htmlFor={fid('front')} className="font-medium">Frente</label>
              <select id={fid('front')} className={input} value={fields.front ?? ''} onChange={(e) => set('front', e.target.value || null)}>
                <option value="">Sem frente definida</option>{FRONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select></div>
          )}
          {keys.includes('status') && (
            <div><label htmlFor={fid('status')} className="font-medium">Estado</label>
              <select id={fid('status')} className={input} value={fields.status ?? 'todo'} onChange={(e) => set('status', e.target.value)}>
                {ACTIVITY_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select></div>
          )}
          {keys.includes('ownerIds') && (
            <fieldset><legend className="font-medium">Responsáveis</legend>
              <div className="mt-1 flex flex-wrap gap-4">
                {members.map((m) => (
                  <label key={m.id} className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={(fields.ownerIds ?? []).includes(m.id)} onChange={(e) => set('ownerIds', e.target.checked ? [...(fields.ownerIds ?? []), m.id] : (fields.ownerIds ?? []).filter((x) => x !== m.id))} />
                    {m.displayName}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <button type="submit" disabled={busy} className="justify-self-start rounded bg-brand px-4 py-2 font-semibold text-white disabled:opacity-60">Salvar ajuste e aceitar</button>
        </form>
      )}

      {mode === 'reject' && (
        <form id={fid('reject')} ref={rejectForm} onSubmit={(e) => { e.preventDefault(); if (note.trim()) void send({ action: 'reject', note }); }} className="max-w-2xl rounded border border-line p-4">
          <label htmlFor={fid('note')} className="font-medium">Motivo (obrigatório, fica no histórico)</label>
          <textarea id={fid('note')} required rows={2} className={input} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="submit" disabled={busy || !note.trim()} className="mt-2 rounded bg-danger px-4 py-2 font-semibold text-white disabled:opacity-60">{conflict ? 'Confirmar descarte' : 'Confirmar rejeição'}</button>
        </form>
      )}

      <p role="status" className="font-medium text-ink">{busy ? 'Registrando revisão…' : ''}</p>
      <p role="alert" className="font-medium text-danger">{error ?? ''}</p>
    </div>
  );
}
