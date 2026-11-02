"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { spunkramTurkish } from "@/lib/spunkram-translations";

type Language = "en" | "tr";
const storageKey = "spunkram-language";
const SpunkramLanguageContext = createContext({
  language: "en" as Language,
  setLanguage: (_language: Language) => {},
  t: (text: string, _values: Record<string, string | number> = {}) => text,
});

export function SpunkramLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("lang");
    let saved: string | null = null;
    try { saved = localStorage.getItem(storageKey); } catch {}
    const initial = requested === "en" || requested === "tr" ? requested : saved;
    if (initial === "tr") setLanguageState("tr");
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try { localStorage.setItem(storageKey, next); } catch {}
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const t = useCallback((text: string, values: Record<string, string | number> = {}) => {
    let translated = language === "tr" ? spunkramTurkish[text] ?? text : text;
    for (const [key, value] of Object.entries(values)) translated = translated.replaceAll("${" + key + "}", String(value));
    return translated;
  }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return (
    <SpunkramLanguageContext.Provider value={value}>
      <div lang={language}>{children}</div>
    </SpunkramLanguageContext.Provider>
  );
}

export function useSpunkramLanguage() {
  return useContext(SpunkramLanguageContext);
}

export function SpunkramText({ children, values }: { children: string; values?: Record<string, string | number> }) {
  const { t } = useSpunkramLanguage();
  return <>{t(children, values)}</>;
}

export function SpunkramLanguageSwitcher() {
  const { language, setLanguage } = useSpunkramLanguage();
  return (
    <div role="group" aria-label={language === "tr" ? "Sayfa dili" : "Page language"} className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-brand-500/25 bg-page/20 p-1">
      {(["en", "tr"] as const).map(option => (
        <button key={option} type="button" aria-pressed={language === option} aria-label={option === "en" ? "English" : "Türkçe"} title={option === "en" ? "English" : "Türkçe"}
          onClick={() => setLanguage(option)}
          className={`cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${language === option ? "bg-brand-violet text-white" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
