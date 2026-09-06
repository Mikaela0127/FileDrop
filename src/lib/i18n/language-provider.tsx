"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { translations, type Locale, type TranslationKey } from "./translations";

const STORAGE_KEY = "filedrop-language";
const CHANGE_EVENT = "filedrop-language-change";
const LOCALES: readonly Locale[] = ["en", "zh-CN", "zh-TW"];
let fallbackLocale: Locale = "en";
type Translate = (
  key: TranslationKey,
  variables?: Record<string, string | number>,
) => string;
interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}
const LanguageContext = createContext<LanguageContextValue | null>(null);

function currentLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    fallbackLocale = LOCALES.includes(stored as Locale)
      ? (stored as Locale)
      : "en";
  } catch {
    // The selector still works for this page when browser storage is disabled.
  }
  return fallbackLocale;
}

function serverLocale(): Locale {
  return "en";
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore<Locale>(
    subscribe,
    currentLocale,
    serverLocale,
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale(next) {
        fallbackLocale = next;
        try {
          window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // The in-memory value keeps language switching available for this page.
        }
        window.dispatchEvent(new Event(CHANGE_EVENT));
      },
      t(key, variables) {
        let value: string = translations[locale][key];
        for (const [name, replacement] of Object.entries(variables ?? {}))
          value = value.replaceAll(`{${name}}`, String(replacement));
        return value;
      },
    }),
    [locale],
  );
  return <LanguageContext value={value}>{children}</LanguageContext>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("LanguageProvider is required");
  return value;
}

export function T({
  id,
  values,
}: {
  id: TranslationKey;
  values?: Record<string, string | number>;
}) {
  const { t } = useLanguage();
  return t(id, values);
}
