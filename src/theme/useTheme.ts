import { useCallback, useEffect, useState } from 'react';
import { applyTheme, loadTheme, type AccentId, type ThemeChoice, type ThemeMode } from './themes';

export function useTheme(): ThemeChoice & {
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentId) => void;
} {
  const [choice, setChoice] = useState<ThemeChoice>(loadTheme);

  useEffect(() => {
    applyTheme(choice);
  }, [choice]);

  useEffect(() => {
    if (choice.mode !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => applyTheme(choice);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [choice]);

  const setMode = useCallback((mode: ThemeMode) => setChoice((c) => ({ ...c, mode })), []);
  const setAccent = useCallback((accent: AccentId) => setChoice((c) => ({ ...c, accent })), []);

  return { ...choice, setMode, setAccent };
}
