export const themeKey = 'examforge-theme';
export type Theme = 'dark' | 'light' | 'system';
export const colorSchemeQuery = '(prefers-color-scheme: dark)';

export function parseTheme(value: string | null): Theme {
  return value === 'light' || value === 'system' ? value : 'dark';
}

// Keep the first paint and the client subscription on the same preference.
export const initialThemeScript = `(() => {
  let preference;
  try { preference = localStorage.getItem(${JSON.stringify(themeKey)}); } catch {}
  document.documentElement.dataset.theme = preference === 'light' ||
    (preference === 'system' && !matchMedia(${JSON.stringify(colorSchemeQuery)}).matches) ? 'light' : 'dark';
})();`;
