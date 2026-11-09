'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { colorSchemeQuery, parseTheme, themeKey } from '@/lib/theme';
import type { Theme } from '@/lib/theme';

let temporary: Theme | undefined;
const themeEvent = 'examforge-theme-change';
const modes = [
  { id: 'dark', label: 'Тъмна', icon: Moon },
  { id: 'light', label: 'Светла', icon: Sun },
  { id: 'system', label: 'Системна', icon: Monitor },
] as const;

const serverPreference = () => 'dark' as const;

function preference() {
  try { return parseTheme(localStorage.getItem(themeKey)); } catch { return temporary ?? 'dark'; }
}

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(themeEvent, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(themeEvent, callback);
  };
}

function change(value: Theme) {
  try { localStorage.setItem(themeKey, value); } catch { temporary = value; }
  window.dispatchEvent(new Event(themeEvent));
}

export function ThemeSync() {
  useEffect(() => {
    const system = matchMedia(colorSchemeQuery);
    const apply = () => {
      const current = preference();
      document.documentElement.dataset.theme = current === 'system' ? (system.matches ? 'dark' : 'light') : current;
    };
    apply();
    const unsubscribe = subscribe(apply);
    system.addEventListener('change', apply);
    return () => { unsubscribe(); system.removeEventListener('change', apply); };
  }, []);
  return null;
}

export function ThemeSelect() {
  const theme = useSyncExternalStore(subscribe, preference, serverPreference);
  return <label>Цветова тема<select value={theme} onChange={event => change(parseTheme(event.target.value))}>
    {modes.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
  </select></label>;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, preference, serverPreference);
  const index = modes.findIndex(mode => mode.id === theme);
  const { icon: Icon, label } = modes[index];
  const next = modes[(index + 1) % modes.length];
  const name = `${label} тема. Смени на ${next.label.toLowerCase()}.`;
  return <button className="icon-button" type="button" title={name} aria-label={name} onClick={() => change(next.id)}>
    <Icon size={18} aria-hidden="true" />
  </button>;
}
