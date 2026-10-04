'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { MemberInfo } from '@/lib/types';

export function MemberSwitcher({ current, members }: { current: MemberInfo; members: MemberInfo[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  async function change(memberId: string) {
    setError(null);
    setAnnounce('');
    try {
      const res = await fetch('/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const name = members.find((m) => m.id === memberId)?.displayName ?? '';
      setAnnounce(`Agora vendo como ${name}`);
    } catch {
      setError('Não foi possível trocar de usuário.');
      return;
    }
    startTransition(() => router.refresh());
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="vendo-como" className="text-sm font-medium">Vendo como</label>
      <select id="vendo-como" value={current.id} onChange={(e) => void change(e.target.value)} className="field rounded-full py-1 text-sm" aria-describedby={error ? 'vendo-como-erro' : undefined}>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName} — {m.front}
            {m.role === 'reviewer' ? ' (revisor)' : ''}
          </option>
        ))}
      </select>
      <span role="status" className="text-sm">{pending ? 'Atualizando…' : announce}</span>
      {error && <span id="vendo-como-erro" role="alert" className="pill bg-danger-soft text-danger">{error}</span>}
    </div>
  );
}
