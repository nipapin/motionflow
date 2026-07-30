/**
 * Shared language whitelist for captions translation + chapters output language.
 * Keep in sync with CEP panel `src/js/data/languages.ts` TRANSLATE_TARGETS.
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ru: "Russian",
  es: "Spanish",
  de: "German",
  fr: "French",
  tr: "Turkish",
  it: "Italian",
  pt: "Portuguese",
  pl: "Polish",
  uk: "Ukrainian",
};

export function languageNameFor(code: string | undefined | null): string | undefined {
  if (!code) return undefined;
  return LANGUAGE_NAMES[code.trim().toLowerCase()];
}
