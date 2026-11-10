'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'bsch-clinic-theme';

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
    'content',
    theme === 'dark' ? '#102321' : '#087F78'
  );
}

function readSavedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

function getPreferredTheme(): Theme {
  return readSavedTheme()
    || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : getPreferredTheme();
    applyTheme(current);
    setTheme(current);
    setReady(true);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next: Theme = event.newValue === 'dark'
        ? 'dark'
        : event.newValue === 'light'
          ? 'light'
          : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      applyTheme(next);
      setTheme(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The theme still changes for this session when storage is unavailable.
    }
    applyTheme(next);
    setTheme(next);
  };

  if (!ready) return null;
  const Icon = theme === 'dark' ? Sun : Moon;
  const actionLabel = theme === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-[#79C7C1]/60 bg-white/80 text-[#087F78] shadow-2xs transition hover:bg-[#F0F7F6] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#087F78] focus-visible:ring-offset-2 dark:bg-[#142624]/80"
      aria-label={actionLabel}
      aria-pressed={theme === 'dark'}
      title={actionLabel}
      dir="rtl"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
