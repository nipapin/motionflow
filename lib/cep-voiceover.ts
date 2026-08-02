import "server-only";
import { CEP_LANGUAGE_OPTIONS } from "@/lib/minimax-language-boost";

/**
 * Voice catalog for the CEP Voiceover tool (MiniMax speech via Replicate,
 * same model as /api/generations/tts). `id` values are MiniMax system voice
 * ids accepted by `minimax/speech-2.8-hd`.
 *
 * Voices are language-agnostic — target language is selected via
 * `language_boost` on generate.
 */

export type CepVoice = {
  id: string;
  name: string;
  gender: "female" | "male";
  /** Path under the site origin (public/voice-previews). */
  previewPath: string;
};

export const CEP_VOICES: CepVoice[] = [
  { id: "Wise_Woman", name: "Wise Woman", gender: "female", previewPath: "/voice-previews/Wise_Woman.mp3" },
  { id: "Friendly_Person", name: "Friendly Person", gender: "female", previewPath: "/voice-previews/Friendly_Person.mp3" },
  { id: "Inspirational_girl", name: "Inspirational Girl", gender: "female", previewPath: "/voice-previews/Inspirational_girl.mp3" },
  { id: "Deep_Voice_Man", name: "Deep Voice Man", gender: "male", previewPath: "/voice-previews/Deep_Voice_Man.mp3" },
  { id: "Calm_Woman", name: "Calm Woman", gender: "female", previewPath: "/voice-previews/Calm_Woman.mp3" },
  { id: "Casual_Guy", name: "Casual Guy", gender: "male", previewPath: "/voice-previews/Casual_Guy.mp3" },
  { id: "Lively_Girl", name: "Lively Girl", gender: "female", previewPath: "/voice-previews/Lively_Girl.mp3" },
  { id: "Patient_Man", name: "Patient Man", gender: "male", previewPath: "/voice-previews/Patient_Man.mp3" },
  { id: "Young_Knight", name: "Young Knight", gender: "male", previewPath: "/voice-previews/Young_Knight.mp3" },
  { id: "Determined_Man", name: "Determined Man", gender: "male", previewPath: "/voice-previews/Determined_Man.mp3" },
  { id: "Lovely_Girl", name: "Lovely Girl", gender: "female", previewPath: "/voice-previews/Lovely_Girl.mp3" },
  { id: "Decent_Boy", name: "Decent Boy", gender: "male", previewPath: "/voice-previews/Decent_Boy.mp3" },
  { id: "Imposing_Manner", name: "Imposing Manner", gender: "male", previewPath: "/voice-previews/Imposing_Manner.mp3" },
  { id: "Elegant_Man", name: "Elegant Man", gender: "male", previewPath: "/voice-previews/Elegant_Man.mp3" },
  { id: "Abbess", name: "Abbess", gender: "female", previewPath: "/voice-previews/Abbess.mp3" },
  { id: "Sweet_Girl_2", name: "Sweet Girl", gender: "female", previewPath: "/voice-previews/Sweet_Girl_2.mp3" },
  { id: "Exuberant_Girl", name: "Exuberant Girl", gender: "female", previewPath: "/voice-previews/Exuberant_Girl.mp3" },
];

/** Re-export for the voices catalog endpoint. */
export { CEP_LANGUAGE_OPTIONS };

/** Legacy ids hardcoded in early CEP builds (pre-backend mock list). */
const VOICE_ALIASES: Record<string, string> = {
  "minimax-friendly-en": "Friendly_Person",
  "minimax-narrator-en": "Deep_Voice_Man",
  "minimax-warm-ru": "Calm_Woman",
  "minimax-deep-ru": "Imposing_Manner",
};

const VOICE_IDS = new Set(CEP_VOICES.map((v) => v.id));

/** Map an incoming voice id (including legacy CEP mock ids) to a valid MiniMax id. */
export function resolveVoiceId(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const id = raw.trim();
  if (VOICE_IDS.has(id)) return id;
  return VOICE_ALIASES[id] ?? null;
}
