import type {
  ApiGenerationRecord,
  ImageHistory,
  SttFormat,
  SttHistory,
  TtsHistory,
  VideoHistory,
} from "@/lib/generations-types";

export const VIDEO_STYLE_PRESETS = [
  { id: "cinematic", label: "Cinematic" },
  { id: "anime", label: "Anime" },
  { id: "realistic", label: "Realistic" },
  { id: "artistic", label: "Artistic" },
] as const;

export const IMAGE_STYLE_PRESETS = [
  { id: "realistic", label: "Realistic" },
  { id: "anime", label: "Anime" },
  { id: "3d", label: "3D Render" },
  { id: "digital-art", label: "Digital Art" },
  { id: "oil-painting", label: "Oil Painting" },
  { id: "watercolor", label: "Watercolor" },
] as const;

export const STT_FORMAT_META: Record<
  SttFormat,
  { extension: string; mime: string; label: string }
> = {
  text: { extension: ".txt", mime: "text/plain", label: ".txt" },
  srt: { extension: ".srt", mime: "application/x-subrip", label: ".srt" },
  vtt: { extension: ".vtt", mime: "text/vtt", label: ".vtt" },
};

export function parseSttFormat(value: unknown): SttFormat {
  if (value === "srt" || value === "vtt" || value === "text") return value;
  return "text";
}

export function stripExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return name;
  return name.slice(0, idx);
}

export function downloadTranscriptFile(
  content: string,
  filename: string,
  mime: string,
): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mapVideoRecord(row: ApiGenerationRecord): VideoHistory {
  const s = row.settings;
  const kind = s.kind === "extend" ? "extend" : "generate";
  const videoUrl =
    row.status === "ok" && row.result && typeof row.result.video === "string"
      ? row.result.video
      : "";
  return {
    id: row.id,
    prompt: typeof s.prompt === "string" ? s.prompt : "",
    style: typeof s.style === "string" ? s.style : "realistic",
    durationSec:
      kind === "extend"
        ? String(s.extend_duration ?? "")
        : String(s.duration ?? ""),
    aspectRatio: typeof s.aspect_ratio === "string" ? s.aspect_ratio : "16:9",
    videoUrl,
    timestamp: new Date(row.created_at),
    kind,
    recordStatus: row.status === "failed" ? "failed" : "ok",
    errorMessage: row.error_message ?? undefined,
    firstFrameUrl:
      typeof s.first_frame_url === "string" ? s.first_frame_url : undefined,
  };
}

export function mapImageRecord(row: ApiGenerationRecord): ImageHistory {
  const s = row.settings;
  const images =
    row.status === "ok" &&
    row.result &&
    Array.isArray(row.result.images) &&
    row.result.images.every((x) => typeof x === "string")
      ? (row.result.images as string[])
      : [];
  return {
    id: row.id,
    prompt: typeof s.prompt === "string" ? s.prompt : "",
    style: typeof s.style === "string" ? s.style : "realistic",
    ratio: typeof s.aspect_ratio === "string" ? s.aspect_ratio : "1:1",
    images,
    timestamp: new Date(row.created_at),
    recordStatus: row.status === "failed" ? "failed" : "ok",
    errorMessage: row.error_message ?? undefined,
  };
}

export function mapTtsRecord(row: ApiGenerationRecord): TtsHistory {
  const s = row.settings;
  const r = row.result;
  const audioUrl =
    r && typeof r.audio_url === "string"
      ? r.audio_url
      : r && typeof r.audio === "string"
        ? r.audio
        : "";
  return {
    id: row.id,
    text:
      typeof s.text === "string"
        ? s.text
        : typeof s.prompt === "string"
          ? s.prompt
          : "",
    voice: typeof s.voice === "string" ? s.voice : "",
    speed: s.speed != null ? String(s.speed) : "1",
    audioUrl: row.status === "ok" ? audioUrl : "",
    timestamp: new Date(row.created_at),
    recordStatus: row.status === "failed" ? "failed" : "ok",
    errorMessage: row.error_message ?? undefined,
  };
}

export function mapSttRecord(row: ApiGenerationRecord): SttHistory {
  const s = row.settings;
  const r = row.result;
  const transcript =
    r && typeof r.text === "string"
      ? r.text
      : r && typeof r.transcript === "string"
        ? r.transcript
        : "";
  const sourceUrl =
    typeof s.audio_url === "string"
      ? s.audio_url
      : typeof s.source_url === "string"
        ? s.source_url
        : "";
  const format = parseSttFormat(
    (r && r.output_format) ?? s.output_format ?? s.format,
  );
  const filename =
    typeof s.filename === "string" && s.filename ? s.filename : "transcription";
  return {
    id: row.id,
    text: row.status === "ok" ? transcript : "",
    sourceUrl,
    language: typeof s.language === "string" ? s.language : undefined,
    format,
    filename,
    timestamp: new Date(row.created_at),
    recordStatus: row.status === "failed" ? "failed" : "ok",
    errorMessage: row.error_message ?? undefined,
  };
}
