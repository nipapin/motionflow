export type TabValue = "image" | "video" | "tts" | "stt";

export type ApiGenerationRecord = {
  id: string;
  status: string;
  settings: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

export interface VideoHistory {
  id: string;
  prompt: string;
  style: string;
  durationSec: string;
  aspectRatio: string;
  videoUrl: string;
  timestamp: Date;
  kind?: "generate" | "extend";
  recordStatus?: "ok" | "failed";
  errorMessage?: string;
  firstFrameUrl?: string;
}

export interface ImageHistory {
  id: string;
  prompt: string;
  style: string;
  ratio: string;
  images: string[];
  timestamp: Date;
  recordStatus?: "ok" | "failed";
  errorMessage?: string;
}

export interface TtsHistory {
  id: string;
  text: string;
  voice: string;
  speed: string;
  audioUrl: string;
  timestamp: Date;
  recordStatus?: "ok" | "failed";
  errorMessage?: string;
}

export type SttFormat = "text" | "srt" | "vtt";

export interface SttHistory {
  id: string;
  text: string;
  sourceUrl: string;
  language?: string;
  format: SttFormat;
  filename: string;
  timestamp: Date;
  recordStatus?: "ok" | "failed";
  errorMessage?: string;
}
