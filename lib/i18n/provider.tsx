"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LANG, LANG_COOKIE, localeOf, makeT, translateOr, type Lang, type TFunction } from "./index";

type Ctx = { lang: Lang; locale: string; t: TFunction; /** Like t() but for a key that may not exist yet. */ tr: (key: string, fallback: string) => string; setLanguage: (next: Lang) => void };

const LanguageContext = createContext<Ctx>({ lang: DEFAULT_LANG, locale: localeOf(DEFAULT_LANG), t: makeT(DEFAULT_LANG), tr: (_k, fallback) => fallback, setLanguage: () => {} });

/**
 * The language comes from the `lang` cookie, read on the SERVER (see LangBoundary), so the first paint is already in the
 * right language. Switching writes the cookie, saves it on the profile (server action) and refreshes the server tree.
 */
export function LanguageProvider({ lang: initial, persist, children }: { lang: Lang; persist?: (lang: Lang) => Promise<unknown>; children: React.ReactNode }) {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>(initial);

  // A server render with a new cookie (after router.refresh) brings the new value in.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setLang(initial);
  }
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLanguage = useCallback(
    (next: Lang) => {
      setLang(next);
      try {
        document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      } catch {
        /* cookies blocked: the choice lasts until reload */
      }
      void persist?.(next);
      router.refresh();
    },
    [persist, router]
  );

  const value = useMemo<Ctx>(() => ({ lang, locale: localeOf(lang), t: makeT(lang), tr: (key, fallback) => translateOr(lang, key, fallback), setLanguage }), [lang, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
export const useT = () => useContext(LanguageContext).t;
