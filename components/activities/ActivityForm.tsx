'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ActivityFieldsFieldset } from '@/components/forms/ActivityFieldsFieldset';
import type { ActivityFields, MemberInfo } from '@/lib/types';

export function ActivityForm({ mode, activityId, initial, members }: { mode: 'create' | 'edit'; activityId?: string; initial: ActivityFields; members: MemberInfo[] }) {
  const router = useRouter();
  const [value, setValue] = useState<ActivityFields>(initial);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors([]);
    const res = await fetch(mode === 'create' ? '/api/activities' : `/api/activities/${activityId}`, {
      method: mode === 'create' ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...value, reason: reason || undefined }),
    }).catch(() => null);
    setSaving(false);
    if (!res) {
      setErrors(['Sem conexão com o servidor. Tente novamente.']);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setErrors(Array.isArray(body?.errors) && body.errors.length ? body.errors : [`Erro ao salvar (HTTP ${res.status})`]);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    router.push(`/atividades/${body?.id ?? activityId}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="card max-w-3xl space-y-6">
      {errors.length > 0 && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-2xl border border-transparent bg-danger-soft px-4 py-3">
          <p className="font-semibold">Corrija antes de salvar:</p>
          <ul className="list-disc pl-5">{errors.map((er) => <li key={er}>{er}</li>)}</ul>
        </div>
      )}
      <ActivityFieldsFieldset value={value} onChange={setValue} members={members} idPrefix="atividade" />
      {mode === 'edit' && (
        <div>
          <label htmlFor="atividade-motivo" className="font-medium">Motivo da alteração (opcional, vai para o histórico)</label>
          <input id="atividade-motivo" className="field mt-1 block w-full" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}
      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? 'Salvando…' : mode === 'create' ? 'Criar atividade' : 'Salvar alterações'}
        </button>
        <button type="button" onClick={() => router.back()} className="btn btn-neutral">Cancelar</button>
      </div>
    </form>
  );
}
