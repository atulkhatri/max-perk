import { useCallback, useEffect, useState } from 'react';
import { applyTheme, loadTheme, type ThemeChoice, type ThemeMode } from './themes';

export function useTheme(): ThemeChoice & {
  setMode: (mode: ThemeMode) => void;
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

  const setMode = useCallback((mode: ThemeMode) => setChoice({ mode }), []);

  return { ...choice, setMode };
}
