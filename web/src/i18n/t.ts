// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Interface texts (10_interfaz.md §7): every visible string comes from en.json. No i18n library
// (02_arquitectura.md §3): a typed lookup with `{name}` placeholders.
import en from './en.json';

export type TextKey = keyof typeof en;

const TEXTS: Record<string, string> = en;

/** Text for `key` with `{name}` placeholders filled from `params`. Unknown keys return the key. */
export function t(key: TextKey, params: Record<string, string | number> = {}): string {
  const text = TEXTS[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}
