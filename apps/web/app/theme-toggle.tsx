'use client';

import { useEffect, useState, type ChangeEvent } from 'react';

type ThemeMode = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'modelnaru-theme';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'system';
}

function applyTheme(mode: ThemeMode): void {
  const resolved =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = mode;
}

function storedTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemeMode(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => {
    const initialMode = storedTheme();
    setMode(initialMode);
    applyTheme(initialMode);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => {
      if (storedTheme() === 'system') {
        applyTheme('system');
      }
    };
    media.addEventListener('change', updateSystemTheme);
    return () => media.removeEventListener('change', updateSystemTheme);
  }, []);

  function changeTheme(event: ChangeEvent<HTMLSelectElement>) {
    const nextMode = event.target.value;
    if (!isThemeMode(nextMode)) return;
    setMode(nextMode);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // The selected theme still applies for this page when storage is blocked.
    }
    applyTheme(nextMode);
  }

  return (
    <label className="theme-control">
      <span>테마</span>
      <select value={mode} onChange={changeTheme} aria-label="화면 테마">
        <option value="system">시스템</option>
        <option value="light">라이트</option>
        <option value="dark">다크</option>
      </select>
    </label>
  );
}
