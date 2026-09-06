"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "../lib/i18n/language-provider";
import type { Locale } from "../lib/i18n/translations";

const languages: { locale: Locale; label: string; caption: string }[] = [
  { locale: "en", label: "English", caption: "EN" },
  { locale: "zh-CN", label: "简体中文", caption: "简" },
  { locale: "zh-TW", label: "繁體中文", caption: "繁" },
];

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const current = languages.find((language) => language.locale === locale)!;

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div
      ref={container}
      className="relative z-40 mx-auto flex w-full max-w-5xl flex-col items-end px-4 pt-4 sm:px-10 sm:pt-6"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={`${t("language.label")}: ${current.label}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className={`group flex min-h-11 items-center gap-2.5 rounded-2xl border px-3 py-2 text-sm font-semibold shadow-[0_8px_28px_-12px_rgba(34,50,90,0.25)] backdrop-blur-xl transition duration-200 sm:gap-3 sm:px-3.5 ${open ? "border-indigo-200 bg-white text-indigo-700" : "border-white/80 bg-white/85 text-slate-700 hover:border-indigo-200 hover:bg-white hover:text-indigo-700"}`}
      >
        <span className="grid size-7 place-items-center rounded-xl bg-indigo-50 text-indigo-600 sm:size-8">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="size-[18px]"
          >
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="4" ry="9" />
            <path d="M3 12h18M5 6.5h14M5 17.5h14" />
          </svg>
        </span>
        <span lang={locale}>{current.label}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className={`size-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={t("language.label")}
          className="absolute top-full right-4 mt-2.5 w-56 max-w-[calc(100%-2rem)] rounded-3xl border border-white/80 bg-white/95 p-2 shadow-[0_20px_60px_-20px_rgba(34,50,90,0.3)] backdrop-blur-xl sm:right-10"
        >
          <p className="mx-2 mb-2 border-b border-slate-100 px-2 pt-2 pb-3 text-xs font-semibold tracking-wide text-slate-500">
            {t("language.label")}
          </p>
          {languages.map((language) => (
            <button
              key={language.locale}
              type="button"
              aria-pressed={locale === language.locale}
              onClick={() => {
                setLocale(language.locale);
                setOpen(false);
                trigger.current?.focus();
              }}
              className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors ${locale === language.locale ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}
            >
              <span
                aria-hidden="true"
                className={`grid size-8 shrink-0 place-items-center rounded-xl text-xs font-semibold ${locale === language.locale ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}
              >
                {language.caption}
              </span>
              <span lang={language.locale} className="flex-1">
                {language.label}
              </span>
              {locale === language.locale && (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="size-4"
                >
                  <path
                    d="m4 10 4 4 8-8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
