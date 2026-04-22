"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Copy,
  Download,
  FileText,
  ImageIcon,
  Trash2,
  Video,
  Volume2,
  Mic,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/auth-provider";
import { replicateFileUrlToDisplaySrc } from "@/lib/replicate-file-display-url";
import { WaveformPlayer } from "@/components/waveform-player";

const videoStylePresets = [
  { id: "cinematic", label: "Cinematic" },
  { id: "anime", label: "Anime" },
  { id: "realistic", label: "Realistic" },
  { id: "artistic", label: "Artistic" },
];

const imageStylePresets = [
  { id: "realistic", label: "Realistic" },
  { id: "anime", label: "Anime" },
  { id: "3d", label: "3D Render" },
  { id: "digital-art", label: "Digital Art" },
  { id: "oil-painting", label: "Oil Painting" },
  { id: "watercolor", label: "Watercolor" },
];

type ApiGenerationRecord = {
  id: string;
  status: string;
  settings: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

interface VideoHistory {
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

interface ImageHistory {
  id: string;
  prompt: string;
  style: string;
  ratio: string;
  images: string[];
  timestamp: Date;
  recordStatus?: "ok" | "failed";
  errorMessage?: string;
}

interface TtsHistory {
  id: string;
  text: string;
  voice: string;
  speed: string;
  audioUrl: string;
  timestamp: Date;
  recordStatus?: "ok" | "failed";
  errorMessage?: string;
}

type SttFormat = "text" | "srt" | "vtt";

interface SttHistory {
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

const STT_FORMAT_META: Record<
  SttFormat,
  { extension: string; mime: string; label: string }
> = {
  text: { extension: ".txt", mime: "text/plain", label: ".txt" },
  srt: { extension: ".srt", mime: "application/x-subrip", label: ".srt" },
  vtt: { extension: ".vtt", mime: "text/vtt", label: ".vtt" },
};

function parseSttFormat(value: unknown): SttFormat {
  if (value === "srt" || value === "vtt" || value === "text") return value;
  return "text";
}

function stripExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return name;
  return name.slice(0, idx);
}

function downloadTranscriptFile(
  content: string,
  filename: string,
  mime: string,
) {
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

function mapVideoRecord(row: ApiGenerationRecord): VideoHistory {
  const s = row.settings;
  const kind = s.kind === "extend" ? "extend" : "generate";
  const videoUrl =
    row.status === "ok" &&
    row.result &&
    typeof row.result.video === "string"
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
    aspectRatio:
      typeof s.aspect_ratio === "string" ? s.aspect_ratio : "16:9",
    videoUrl,
    timestamp: new Date(row.created_at),
    kind,
    recordStatus: row.status === "failed" ? "failed" : "ok",
    errorMessage: row.error_message ?? undefined,
    firstFrameUrl:
      typeof s.first_frame_url === "string" ? s.first_frame_url : undefined,
  };
}

function mapTtsRecord(row: ApiGenerationRecord): TtsHistory {
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

function mapSttRecord(row: ApiGenerationRecord): SttHistory {
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

function mapImageRecord(row: ApiGenerationRecord): ImageHistory {
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

export function ProfileGenerations() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = useMemo<"image" | "video" | "tts" | "stt">(() => {
    if (tabParam === "video" || tabParam === "tts" || tabParam === "stt") {
      return tabParam;
    }
    return "image";
  }, [tabParam]);
  const [activeTab, setActiveTab] = useState<"image" | "video" | "tts" | "stt">(
    initialTab,
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleTabChange = useCallback(
    (value: string) => {
      if (
        value !== "image" &&
        value !== "video" &&
        value !== "tts" &&
        value !== "stt"
      ) {
        return;
      }
      setActiveTab(value);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const [videoItems, setVideoItems] = useState<VideoHistory[]>([]);
  const [imageItems, setImageItems] = useState<ImageHistory[]>([]);
  const [ttsItems, setTtsItems] = useState<TtsHistory[]>([]);
  const [sttItems, setSttItems] = useState<SttHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxVideo, setLightboxVideo] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [transcriptItem, setTranscriptItem] = useState<SttHistory | null>(null);
  const [transcriptCopied, setTranscriptCopied] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!transcriptItem) {
      setTranscriptCopied(false);
    }
  }, [transcriptItem]);

  const copyTranscript = useCallback(async (text: string) => {
    if (!text) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setTranscriptCopied(true);
        window.setTimeout(() => setTranscriptCopied(false), 2000);
      }
    } catch {
      /* ignore clipboard errors */
    }
  }, []);

  const downloadTranscript = useCallback((item: SttHistory) => {
    if (!item.text) return;
    const meta = STT_FORMAT_META[item.format] ?? STT_FORMAT_META.text;
    const base = stripExtension(item.filename) || "transcription";
    downloadTranscriptFile(item.text, `${base}${meta.extension}`, meta.mime);
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [videoRes, imageRes, ttsRes, sttRes] = await Promise.all([
        fetch("/api/me/generation-records?tool=video&limit=100", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/me/generation-records?tool=image&limit=100", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/me/generation-records?tool=tts&limit=100", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/me/generation-records?tool=stt&limit=100", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      if (!videoRes.ok || !imageRes.ok || !ttsRes.ok || !sttRes.ok) {
        throw new Error("Failed to load generations");
      }
      const [videoData, imageData, ttsData, sttData] = (await Promise.all([
        videoRes.json(),
        imageRes.json(),
        ttsRes.json(),
        sttRes.json(),
      ])) as Array<{ items?: ApiGenerationRecord[] }>;
      setVideoItems((videoData.items ?? []).map(mapVideoRecord));
      setImageItems((imageData.items ?? []).map(mapImageRecord));
      setTtsItems((ttsData.items ?? []).map(mapTtsRecord));
      setSttItems((sttData.items ?? []).map(mapSttRecord));
    } catch {
      setError("Could not load your generations. Try again later.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const removeRecord = async (
    id: string,
    tool: "video" | "image" | "tts" | "stt",
  ) => {
    setDeleteError(null);
    try {
      const res = await fetch(`/api/me/generation-records/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("delete failed");
      if (tool === "video") {
        setVideoItems((prev) => prev.filter((h) => h.id !== id));
      } else if (tool === "image") {
        setImageItems((prev) => prev.filter((h) => h.id !== id));
      } else if (tool === "tts") {
        setTtsItems((prev) => prev.filter((h) => h.id !== id));
      } else {
        setSttItems((prev) => prev.filter((h) => h.id !== id));
      }
    } catch {
      setDeleteError("Could not remove this item.");
    }
  };

  if (!user) {
    return (
      <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-8 text-center">
        <p className="text-muted-foreground mb-4">
          Sign in to see your image and video generations.
        </p>
        <Button asChild className="bg-linear-to-r from-blue-600 to-blue-500 text-white rounded-xl">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mr-3" />
        Loading generations…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-card/50 p-8 text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <Button variant="secondary" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const videoSection = (
    <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
      {videoItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No video generations yet.{" "}
          <Link
            href="/video-generation"
            className="text-blue-400 hover:underline"
          >
            Create one
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          {videoItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth"
            >
              <button
                type="button"
                className="relative w-24 h-14 rounded-lg overflow-hidden shrink-0 cursor-pointer hover:opacity-80 smooth bg-black disabled:opacity-50"
                onClick={() =>
                  item.videoUrl ? setLightboxVideo(item.videoUrl) : undefined
                }
                disabled={!item.videoUrl}
              >
                {item.videoUrl ? (
                  <video
                    src={item.videoUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground px-1">
                    Failed
                  </div>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{item.prompt}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {item.recordStatus === "failed" && item.errorMessage ? (
                    <span className="text-red-400/90">{item.errorMessage}</span>
                  ) : item.kind === "extend" ? (
                    <>
                      <span className="text-foreground/90">Extend</span>
                      {" · "}
                      {item.prompt}
                      {" · "}
                      {item.durationSec}s
                    </>
                  ) : (
                    <>
                      {videoStylePresets.find((s) => s.id === item.style)
                        ?.label}{" "}
                      | {item.durationSec}s | {item.aspectRatio}
                      {item.firstFrameUrl ? (
                        <span className="text-foreground/80"> · first frame</span>
                      ) : null}
                    </>
                  )}{" "}
                  | {item.timestamp.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {item.videoUrl ? (
                  <a
                    href={item.videoUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => void removeRecord(item.id, "video")}
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const imageSection = (
    <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
      {imageItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No image generations yet.{" "}
          <Link
            href="/image-generation"
            className="text-blue-400 hover:underline"
          >
            Create one
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          {imageItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth"
            >
              {item.images[0] ? (
                <button
                  type="button"
                  className="w-16 h-16 rounded-lg overflow-hidden shrink-0 cursor-pointer hover:opacity-80 smooth border-0 p-0 bg-transparent"
                  onClick={() =>
                    setLightboxImage(
                      replicateFileUrlToDisplaySrc(item.images[0]),
                    )
                  }
                >
                  <img
                    src={replicateFileUrlToDisplaySrc(item.images[0])}
                    alt={item.prompt}
                    className="w-full h-full object-cover"
                  />
                </button>
              ) : (
                <div className="w-16 h-16 rounded-lg bg-muted shrink-0 flex items-center justify-center text-xs text-muted-foreground text-center px-1">
                  {item.recordStatus === "failed" ? "Failed" : "—"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{item.prompt}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {item.recordStatus === "failed" && item.errorMessage ? (
                    <span className="text-red-400/90">{item.errorMessage}</span>
                  ) : (
                    <>
                      {imageStylePresets.find((s) => s.id === item.style)?.label}{" "}
                      | {item.ratio}
                    </>
                  )}{" "}
                  | {item.timestamp.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {item.images[0] ? (
                  <a
                    href={replicateFileUrlToDisplaySrc(item.images[0])}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => void removeRecord(item.id, "image")}
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const ttsSection = (
    <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
      {ttsItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No text-to-speech generations yet.{" "}
          <Link
            href="/text-to-speech"
            className="text-blue-400 hover:underline"
          >
            Create one
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          {ttsItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth"
            >
              <div className="w-12 h-12 shrink-0 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Volume2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm text-foreground line-clamp-2"
                  title={item.text}
                >
                  {item.text || (item.recordStatus === "failed" ? "—" : "Untitled")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {item.recordStatus === "failed" && item.errorMessage ? (
                    <span className="text-red-400/90">{item.errorMessage}</span>
                  ) : (
                    <>
                      {item.voice ? `${item.voice} · ` : ""}
                      {item.speed}x
                    </>
                  )}{" "}
                  | {item.timestamp.toLocaleString()}
                </p>
                {item.audioUrl ? (
                  <audio
                    src={item.audioUrl}
                    controls
                    preload="none"
                    className="mt-2 h-8 w-full max-w-md"
                  />
                ) : null}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {item.audioUrl ? (
                  <a
                    href={item.audioUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => void removeRecord(item.id, "tts")}
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const sttSection = (
    <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
      {sttItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No speech-to-text generations yet.{" "}
          <Link
            href="/speech-to-text"
            className="text-blue-400 hover:underline"
          >
            Create one
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          {sttItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth"
            >
              <div className="w-12 h-12 shrink-0 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Mic className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                {item.recordStatus === "failed" ? (
                  <p className="text-sm text-red-400/90 line-clamp-3">
                    {item.errorMessage ?? "Failed"}
                  </p>
                ) : (
                  <p
                    className="text-sm text-foreground line-clamp-2 whitespace-pre-line"
                    title={item.text}
                  >
                    {item.text || "Empty transcription"}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {item.language ? `${item.language} · ` : ""}
                  {item.timestamp.toLocaleString()}
                </p>
                {item.sourceUrl ? (
                  <WaveformPlayer
                    audioUrl={item.sourceUrl}
                    className="mt-3 rounded-lg border border-blue-500/15 bg-background/40 px-3 py-2"
                  />
                ) : null}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {item.text ? (
                  <button
                    type="button"
                    onClick={() => setTranscriptItem(item)}
                    title="View transcript"
                    aria-label="View transcript"
                    className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void removeRecord(item.id, "stt")}
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-foreground tracking-tight mb-2">
          My generations
        </h1>
        <p className="text-muted-foreground">
          Image, video and audio outputs from the AI tools. Open a generator
          anytime from the sidebar.
        </p>
      </div>

      {deleteError ? (
        <p className="text-sm text-red-400 text-center">{deleteError}</p>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 h-auto gap-1.5 rounded-xl border border-blue-500/25 bg-muted/40 p-1.5 max-w-2xl">
          <TabsTrigger
            value="image"
            className="text-xs sm:text-sm text-muted-foreground data-[state=active]:border-transparent data-[state=active]:bg-linear-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30"
          >
            <ImageIcon className="w-4 h-4 mr-2" />
            Images
          </TabsTrigger>
          <TabsTrigger
            value="video"
            className="text-xs sm:text-sm text-muted-foreground data-[state=active]:border-transparent data-[state=active]:bg-linear-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30"
          >
            <Video className="w-4 h-4 mr-2" />
            Video
          </TabsTrigger>
          <TabsTrigger
            value="tts"
            className="text-xs sm:text-sm text-muted-foreground data-[state=active]:border-transparent data-[state=active]:bg-linear-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30"
          >
            <Volume2 className="w-4 h-4 mr-2" />
            Text to Speech
          </TabsTrigger>
          <TabsTrigger
            value="stt"
            className="text-xs sm:text-sm text-muted-foreground data-[state=active]:border-transparent data-[state=active]:bg-linear-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30"
          >
            <Mic className="w-4 h-4 mr-2" />
            Speech to Text
          </TabsTrigger>
        </TabsList>
        <TabsContent value="image" className="mt-4">
          {imageSection}
        </TabsContent>
        <TabsContent value="video" className="mt-4">
          {videoSection}
        </TabsContent>
        <TabsContent value="tts" className="mt-4">
          {ttsSection}
        </TabsContent>
        <TabsContent value="stt" className="mt-4">
          {sttSection}
        </TabsContent>
      </Tabs>

      {lightboxVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => setLightboxVideo(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxVideo(null)}
            className="absolute top-6 right-6 p-2 text-white/70 hover:text-white smooth z-10"
          >
            <X className="w-8 h-8" />
          </button>
          <div
            className="relative w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative rounded-2xl overflow-hidden border border-blue-500/30 bg-black">
              <video
                src={lightboxVideo}
                controls
                playsInline
                autoPlay
                className="w-full max-h-[80vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={transcriptItem !== null}
        onOpenChange={(open) => {
          if (!open) setTranscriptItem(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl border-blue-500/30 bg-card/95 backdrop-blur">
          <DialogHeader>
            <DialogTitle className="text-foreground">Transcription</DialogTitle>
            <DialogDescription>
              {transcriptItem
                ? [
                    transcriptItem.language || null,
                    transcriptItem.timestamp.toLocaleString(),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : ""}
            </DialogDescription>
          </DialogHeader>
          {transcriptItem ? (
            <>
              <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-blue-500/20 bg-background/40 p-4">
                <pre className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground font-sans">
                  {transcriptItem.text}
                </pre>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-blue-500/30 text-foreground hover:border-blue-500/60"
                  onClick={() => void copyTranscript(transcriptItem.text)}
                >
                  {transcriptCopied ? (
                    <Check className="w-4 h-4 mr-2" />
                  ) : (
                    <Copy className="w-4 h-4 mr-2" />
                  )}
                  {transcriptCopied ? "Copied" : "Copy"}
                </Button>
                <Button
                  type="button"
                  className="rounded-xl bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-blue-400"
                  onClick={() => downloadTranscript(transcriptItem)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download{" "}
                  {(STT_FORMAT_META[transcriptItem.format] ?? STT_FORMAT_META.text).label}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-6 right-6 p-2 text-white/70 hover:text-white smooth"
          >
            <X className="w-8 h-8" />
          </button>
          <div
            className="relative max-w-4xl max-h-[85vh] mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={replicateFileUrlToDisplaySrc(lightboxImage)}
              alt="Generated"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl border border-blue-500/30"
            />
          </div>
        </div>
      )}
    </div>
  );
}
