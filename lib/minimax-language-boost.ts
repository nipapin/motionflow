/**
 * MiniMax Speech `language_boost` values accepted by
 * `minimax/speech-2.8-hd` (same set as /api/generations/tts).
 * @see https://replicate.com/minimax/speech-2.8-hd/api/schema
 */

export const MINIMAX_LANGUAGE_BOOST = [
  "None",
  "Automatic",
  "English",
  "Chinese",
  "Chinese,Yue",
  "Spanish",
  "French",
  "German",
  "Japanese",
  "Korean",
  "Russian",
  "Arabic",
  "Portuguese",
  "Italian",
  "Turkish",
  "Dutch",
  "Indonesian",
  "Vietnamese",
  "Thai",
  "Polish",
  "Romanian",
  "Greek",
  "Czech",
  "Hungarian",
  "Ukrainian",
  "Filipino",
  "Malay",
  "Hindi",
  "Hebrew",
  "Bengali",
] as const;

export type MinimaxLanguageBoost = (typeof MINIMAX_LANGUAGE_BOOST)[number];

export const ALLOWED_LANGUAGE_BOOST = new Set<string>(MINIMAX_LANGUAGE_BOOST);

/** Human labels for CEP / UI language pickers (excludes None — use Automatic). */
export const CEP_LANGUAGE_OPTIONS: ReadonlyArray<{
  id: MinimaxLanguageBoost;
  label: string;
}> = [
  { id: "Automatic", label: "Auto detect" },
  { id: "English", label: "English" },
  { id: "Russian", label: "Russian" },
  { id: "Spanish", label: "Spanish" },
  { id: "French", label: "French" },
  { id: "German", label: "German" },
  { id: "Portuguese", label: "Portuguese" },
  { id: "Italian", label: "Italian" },
  { id: "Ukrainian", label: "Ukrainian" },
  { id: "Polish", label: "Polish" },
  { id: "Turkish", label: "Turkish" },
  { id: "Arabic", label: "Arabic" },
  { id: "Chinese", label: "Chinese" },
  { id: "Chinese,Yue", label: "Cantonese" },
  { id: "Japanese", label: "Japanese" },
  { id: "Korean", label: "Korean" },
  { id: "Hindi", label: "Hindi" },
  { id: "Dutch", label: "Dutch" },
  { id: "Indonesian", label: "Indonesian" },
  { id: "Vietnamese", label: "Vietnamese" },
  { id: "Thai", label: "Thai" },
  { id: "Romanian", label: "Romanian" },
  { id: "Greek", label: "Greek" },
  { id: "Czech", label: "Czech" },
  { id: "Hungarian", label: "Hungarian" },
  { id: "Filipino", label: "Filipino" },
  { id: "Malay", label: "Malay" },
  { id: "Hebrew", label: "Hebrew" },
  { id: "Bengali", label: "Bengali" },
];

const DEFAULT_LANGUAGE_BOOST: MinimaxLanguageBoost = "Automatic";

/** Map short codes / aliases to MiniMax language_boost values. */
const LANGUAGE_ALIASES: Record<string, MinimaxLanguageBoost> = {
  auto: "Automatic",
  automatic: "Automatic",
  none: "None",
  en: "English",
  eng: "English",
  english: "English",
  ru: "Russian",
  rus: "Russian",
  russian: "Russian",
  es: "Spanish",
  spanish: "Spanish",
  fr: "French",
  french: "French",
  de: "German",
  german: "German",
  pt: "Portuguese",
  portuguese: "Portuguese",
  it: "Italian",
  italian: "Italian",
  uk: "Ukrainian",
  ua: "Ukrainian",
  ukrainian: "Ukrainian",
  pl: "Polish",
  polish: "Polish",
  tr: "Turkish",
  turkish: "Turkish",
  ar: "Arabic",
  arabic: "Arabic",
  zh: "Chinese",
  cn: "Chinese",
  chinese: "Chinese",
  yue: "Chinese,Yue",
  cantonese: "Chinese,Yue",
  ja: "Japanese",
  jp: "Japanese",
  japanese: "Japanese",
  ko: "Korean",
  kr: "Korean",
  korean: "Korean",
  hi: "Hindi",
  hindi: "Hindi",
  nl: "Dutch",
  dutch: "Dutch",
  id: "Indonesian",
  indonesian: "Indonesian",
  vi: "Vietnamese",
  vietnamese: "Vietnamese",
  th: "Thai",
  thai: "Thai",
  ro: "Romanian",
  romanian: "Romanian",
  el: "Greek",
  greek: "Greek",
  cs: "Czech",
  czech: "Czech",
  hu: "Hungarian",
  hungarian: "Hungarian",
  fil: "Filipino",
  filipino: "Filipino",
  ms: "Malay",
  malay: "Malay",
  he: "Hebrew",
  hebrew: "Hebrew",
  bn: "Bengali",
  bengali: "Bengali",
};

/**
 * Resolve `language_boost` or short `language` code from a request body.
 * Defaults to Automatic when missing/invalid.
 */
export function resolveLanguageBoost(
  languageBoost: unknown,
  language?: unknown,
): MinimaxLanguageBoost {
  if (typeof languageBoost === "string" && languageBoost.trim()) {
    const raw = languageBoost.trim();
    if (ALLOWED_LANGUAGE_BOOST.has(raw)) return raw as MinimaxLanguageBoost;
    const alias = LANGUAGE_ALIASES[raw.toLowerCase()];
    if (alias) return alias;
  }
  if (typeof language === "string" && language.trim()) {
    const raw = language.trim();
    if (ALLOWED_LANGUAGE_BOOST.has(raw)) return raw as MinimaxLanguageBoost;
    const alias = LANGUAGE_ALIASES[raw.toLowerCase()];
    if (alias) return alias;
  }
  return DEFAULT_LANGUAGE_BOOST;
}
