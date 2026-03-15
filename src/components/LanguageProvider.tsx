"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Locale } from "@/lib/i18n/translations";
import { translations } from "@/lib/i18n/translations";

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunction;
}

// Translation function type
type TFunction = {
  <S extends keyof typeof translations, K extends keyof (typeof translations)[S]>(
    section: S,
    key: K
  ): string;
};

const LanguageContext = createContext<LanguageContextType>({
  locale: "fr",
  setLocale: () => {},
  t: (() => "") as TFunction,
});

export function useLanguage() {
  return useContext(LanguageContext);
}

// Convenience hook that returns just the t function
export function useTranslation() {
  const { t, locale } = useContext(LanguageContext);
  return { t, locale };
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Always start with "fr" to match server render and avoid hydration mismatch
  const [locale, setLocaleState] = useState<Locale>("fr");

  // Sync from localStorage + API on mount (client-only)
  useEffect(() => {
    const stored = localStorage.getItem("language_preference") as Locale | null;
    if (stored && stored !== "fr") {
      setLocaleState(stored);
      document.documentElement.lang = stored;
    }

    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.appearance?.language) {
          const lang = data.appearance.language as Locale;
          setLocaleState((prev) => {
            if (lang !== prev) {
              localStorage.setItem("language_preference", lang);
              document.documentElement.lang = lang;
              return lang;
            }
            return prev;
          });
        }
      })
      .catch(() => {});
  }, []);

  // Update html lang attribute
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem("language_preference", newLocale);
    document.documentElement.lang = newLocale;
    // Sync to API (fire and forget)
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appearance: { language: newLocale } }),
    }).catch(() => {});
  }, []);

  const t = useCallback(
    (section: string, key: string): string => {
      const sectionData = (translations as Record<string, Record<string, Record<string, string>>>)[section];
      if (!sectionData) return key;
      const entry = sectionData[key];
      if (!entry) return key;
      return entry[locale] || entry.fr || key;
    },
    [locale]
  ) as TFunction;

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
