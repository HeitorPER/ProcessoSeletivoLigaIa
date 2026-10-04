'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

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
    <nav aria-label="Navegação principal" className="px-4 pt-4 md:w-72 md:shrink-0 md:py-6 md:pl-8 md:pr-0">
      <button type="button" className="btn btn-neutral btn-sm md:hidden" aria-expanded={open} aria-controls="menu-principal" onClick={() => setOpen((o) => !o)}>
        {open ? 'Fechar menu' : 'Menu'}
      </button>
      {/* Painel lateral: itens com cantos de 12 px e a troca de tema no rodapé. */}
      <div id="menu-principal" className={`${open ? 'block' : 'hidden'} mt-3 rounded-card border border-card-border bg-panel p-3 shadow-card md:sticky md:top-20 md:mt-0 md:block`}>
        <ul className="space-y-1">
          {ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between gap-2 rounded-xl border border-transparent px-3.5 py-2.5 text-[15px] transition-colors ${active ? 'bg-brand-soft font-semibold text-brand' : 'text-ink hover:bg-tint'}`}
                >
                  <span>{item.label}</span>
                  {item.counter && pendingCount > 0 && (
                    <>
                      <span aria-hidden="true" className="rounded-full bg-accent px-2 text-xs font-bold text-[#0b0b14]">{pendingCount}</span>
                      <span className="sr-only"> ({pendingCount} pendentes)</span>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 border-t border-hairline pt-3">
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
