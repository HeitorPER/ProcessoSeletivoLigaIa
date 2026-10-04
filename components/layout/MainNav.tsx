'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const ITEMS = [
  { href: '/comece-aqui', label: 'Comece aqui' },
  { href: '/minhas', label: 'Minhas atividades' },
  { href: '/atividades', label: 'Todas as atividades' },
  { href: '/sugestoes', label: 'Sugestões para revisar', counter: true },
  { href: '/novidades', label: 'Novidades dos documentos' },
  { href: '/sincronizacao', label: 'Estado da sincronização' },
];

export function MainNav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => pathname === href || (href === '/atividades' && pathname.startsWith('/atividades/'));
  return (
    <nav aria-label="Navegação principal" className="border-b border-line md:w-64 md:shrink-0 md:border-b-0 md:border-r">
      <button type="button" className="mx-4 my-3 rounded border border-line px-3 py-2 text-sm font-medium md:hidden" aria-expanded={open} aria-controls="menu-principal" onClick={() => setOpen((o) => !o)}>
        {open ? 'Fechar menu' : 'Menu'}
      </button>
      <ul id="menu-principal" className={`${open ? 'block' : 'hidden'} space-y-1 px-2 pb-4 md:block md:py-6`}>
        {ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between gap-2 rounded border-l-4 px-3 py-2 ${active ? 'border-accent bg-surface font-semibold text-brand' : 'border-transparent text-ink hover:bg-surface'}`}
              >
                <span>{item.label}</span>
                {item.counter && pendingCount > 0 && (
                  <>
                    <span aria-hidden="true" className="rounded-full bg-accent px-2 text-xs font-bold text-ink">{pendingCount}</span>
                    <span className="sr-only"> ({pendingCount} pendentes)</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
