'use client';
import { useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY } from '@/lib/theme';

type Theme = 'light' | 'dark';

/** Tema em uso: a escolha gravada (atributo data-theme no <html>) ou, sem escolha, a preferência do sistema. */
function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener('change', onChange);
  };
}

export function ThemeToggle() {
  // No servidor não há tema conhecido: nenhum botão aparece marcado até o navegador assumir.
  const theme = useSyncExternalStore(subscribe, currentTheme, () => null);
  function choose(next: Theme) {
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // navegação privada ou armazenamento bloqueado: o tema vale só nesta página
    }
  }
  return (
    <div role="group" aria-label="Tema da interface" className="flex gap-1 rounded-xl bg-tint p-1">
      {(['light', 'dark'] as const).map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          onClick={() => choose(t)}
          className={`flex-1 rounded-lg border border-transparent px-3 py-1.5 text-sm transition-colors ${theme === t ? 'bg-raised font-semibold text-ink shadow-sm' : 'font-medium text-muted hover:text-ink'}`}
        >
          {t === 'light' ? 'Claro' : 'Escuro'}
        </button>
      ))}
    </div>
  );
}

