'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { MemberInfo } from '@/lib/types';

export function MemberSwitcher({ current, members }: { current: MemberInfo; members: MemberInfo[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  async function change(memberId: string) {
    setError(null);
    const res = await fetch('/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId }) });
    if (!res.ok) {
      setError('Não foi possível trocar de usuário.');
      return;
    }
    startTransition(() => router.refresh());
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="vendo-como" className="text-sm font-medium">Vendo como</label>
      <select id="vendo-como" value={current.id} onChange={(e) => void change(e.target.value)} className="rounded border border-line bg-white px-2 py-1 text-sm text-ink" aria-describedby={error ? 'vendo-como-erro' : undefined}>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName} — {m.front}
            {m.role === 'reviewer' ? ' (revisor)' : ''}
          </option>
        ))}
      </select>
      <span role="status" className="text-sm">{pending ? 'Atualizando…' : ''}</span>
      {error && <span id="vendo-como-erro" role="alert" className="text-sm text-danger">{error}</span>}
    </div>
  );
}
