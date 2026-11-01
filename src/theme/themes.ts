// Theme model: light/dark/system mode only. All colour and shape values
// live in src/index.css (admin-edited); users only choose the mode.
// Applied as a .dark class on <html> (Tailwind/shadcn convention).

export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];

const STORAGE_KEY = 'card-offers:theme';

export interface ThemeChoice {
  mode: ThemeMode;
}

export const DEFAULT_THEME: ThemeChoice = { mode: 'system' };

// Brand header colour per mode, kept in sync with the tokens in index.css.
const META_THEME_COLOR: Record<'light' | 'dark', string> = {
  light: '#fafafa',
  dark: '#0a0a0a',
};

export function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function loadTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    const parsed = JSON.parse(raw) as Partial<ThemeChoice>;
    const mode = THEME_MODES.includes(parsed.mode as ThemeMode)
      ? (parsed.mode as ThemeMode)
      : DEFAULT_THEME.mode;
    return { mode };
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const resolved = resolveMode(choice.mode);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  // Legacy attribute kept so old cached CSS never un-themes the page.
  root.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_THEME_COLOR[resolved]);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Private browsing: theme simply does not persist.
  }
}
