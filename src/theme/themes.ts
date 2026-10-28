// Theme model: appearance mode + accent colour, persisted to localStorage.
// Applied as data attributes on <html>; all styling lives in app.css.

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentId = 'forest' | 'ocean' | 'copper' | 'graphite';

export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];

export const ACCENTS: { id: AccentId; label: string }[] = [
  { id: 'forest', label: 'Forest' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'copper', label: 'Copper' },
  { id: 'graphite', label: 'Graphite' },
];

const STORAGE_KEY = 'card-offers:theme';

export interface ThemeChoice {
  mode: ThemeMode;
  accent: AccentId;
}

export const DEFAULT_THEME: ThemeChoice = { mode: 'system', accent: 'forest' };

export function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function loadTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    const parsed = JSON.parse(raw) as Partial<ThemeChoice>;
    const mode = THEME_MODES.includes(parsed.mode as ThemeMode) ? (parsed.mode as ThemeMode) : DEFAULT_THEME.mode;
    const accent = ACCENTS.some((a) => a.id === parsed.accent) ? (parsed.accent as AccentId) : DEFAULT_THEME.accent;
    return { mode, accent };
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const resolved = resolveMode(choice.mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.accent = choice.accent;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Private browsing: theme simply does not persist.
  }
}
