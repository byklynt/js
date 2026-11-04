import { id, type TKey } from "./id";
import { en } from "./en";

export type { TKey };
export type Lang = "id" | "en";
export const LANGS: Lang[] = ["id", "en"];
export const DEFAULT_LANG: Lang = "id";
export const LANG_COOKIE = "lang";

export const normalizeLang = (value: string | null | undefined): Lang => (value === "en" ? "en" : "id");

/** Intl locale for numbers and dates. Currency stays Rupiah whatever the language. */
export const localeOf = (lang: Lang): string => (lang === "en" ? "en-US" : "id-ID");

const dictionaries: Record<Lang, Partial<Record<TKey, string>>> = { id, en };

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

/** t(): English falls back to Indonesian when a key has no English text yet. */
export function translate(lang: Lang, key: TKey, params?: Record<string, string | number>): string {
  const text = dictionaries[lang][key] ?? id[key];
  return interpolate(text, params);
}

/** For text that may not have a key yet (for example a breadcrumb parent): returns `fallback` when the key is unknown. */
export function translateOr(lang: Lang, key: string, fallback: string, params?: Record<string, string | number>): string {
  return key in id ? translate(lang, key as TKey, params) : fallback;
}

export const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export type TFunction = (key: TKey, params?: Record<string, string | number>) => string;
export const makeT = (lang: Lang): TFunction => (key, params) => translate(lang, key, params);

/** Keys that exist in the Indonesian dictionary but not in the English one. */
export function findMissingKeys(source: Record<string, string>, target: Record<string, string | undefined>): string[] {
  return Object.keys(source).filter((k) => !target[k]);
}

/** English keys that have no Indonesian source (typos / leftovers). */
export function findOrphanKeys(source: Record<string, string>, target: Record<string, string | undefined>): string[] {
  return Object.keys(target).filter((k) => !(k in source));
}
