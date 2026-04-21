"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  Video,
  Download,
  RefreshCw,
  Clock,
  Trash2,
  X,
  Ratio,
  Palette,
  ImageIcon,
  Frame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGenerations, type GenerationStatus } from "@/hooks/use-generations";
import { GenerationsBadge } from "@/components/generations-badge";

const TARGET_RESOLUTION = "720" as const;

const durationOptions = [
  { id: "5", label: "5 sec" },
  { id: "10", label: "10 sec" },
];

const aspectRatios = [
  { id: "16:9", label: "16:9 — Widescreen" },
  { id: "9:16", label: "9:16 — Portrait" },
  { id: "1:1", label: "1:1 — Square" },
];

const stylePresets = [
  { id: "cinematic", label: "Cinematic" },
  { id: "anime", label: "Anime" },
  { id: "realistic", label: "Realistic" },
  { id: "artistic", label: "Artistic" },
];

/** Matches `/api/generations/image` styles for the “Generate” tab in First frame. */
const ffImageStyles = [
  { id: "realistic", label: "Realistic" },
  { id: "anime", label: "Anime" },
  { id: "3d", label: "3D Render" },
  { id: "digital-art", label: "Digital Art" },
  { id: "oil-painting", label: "Oil Painting" },
  { id: "watercolor", label: "Watercolor" },
];

const ffImageRatios = [
  { id: "1:1", label: "1:1" },
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
];

/** First-frame dialog tabs: active = site blue gradient. */
const ffDialogTabTriggerClass =
  "text-xs sm:text-sm text-muted-foreground data-[state=active]:border-transparent data-[state=active]:bg-linear-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30 data-[state=active]:dark:from-blue-600 data-[state=active]:dark:to-blue-500";

interface VideoHistory {
  id: string;
  prompt: string;
  style: string;
  durationSec: string;
  resolution: string;
  aspectRatio: string;
  videoUrl: string;
  timestamp: Date;
  kind?: "generate" | "extend";
  recordStatus?: "ok" | "failed";
  errorMessage?: string;
  firstFrameUrl?: string;
}

type ApiGenerationRecord = {
  id: string;
  status: string;
  settings: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

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
    style: typeof s.style === "string" ? s.style : "cinematic",
    durationSec:
      kind === "extend"
        ? String(s.extend_duration ?? "")
        : String(s.duration ?? ""),
    resolution:
      typeof s.target_resolution === "string" ? s.target_resolution : "720",
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

export function VideoGenerator() {
  const {
    status: generations,
    loading: generationsLoading,
    error: generationsError,
    authenticated,
    setStatus: setGenerationsStatus,
    refresh: refreshGenerations,
  } = useGenerations();

  const [prompt, setPrompt] = useState("");
  const [selectedDuration, setSelectedDuration] = useState("5");
  const [selectedAspectRatio, setSelectedAspectRatio] = useState("16:9");
  const [selectedStyle, setSelectedStyle] = useState("cinematic");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [history, setHistory] = useState<VideoHistory[]>([]);
  const [lightboxVideo, setLightboxVideo] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [firstFrameUrl, setFirstFrameUrl] = useState<string | null>(null);
  const [firstFrameDialogOpen, setFirstFrameDialogOpen] = useState(false);
  const [ffUploading, setFfUploading] = useState(false);
  const [ffGenLoading, setFfGenLoading] = useState(false);
  const [libraryItems, setLibraryItems] = useState<{ id: string; url: string }[]>(
    [],
  );
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [ffPrompt, setFfPrompt] = useState("");
  const [ffStyle, setFfStyle] = useState("realistic");
  const [ffRatio, setFfRatio] = useState("1:1");

  const remaining = generations?.remaining ?? 0;
  const noGenerationsLeft =
    authenticated && !generationsLoading && remaining <= 0;

  useEffect(() => {
    if (!authenticated) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/me/generation-records?tool=video&limit=100", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { items?: ApiGenerationRecord[] };
        const mapped = (data.items ?? []).map(mapVideoRecord);
        if (cancelled) return;
        setHistory(mapped);
        const firstOk = mapped.find(
          (h) => h.recordStatus === "ok" && h.videoUrl,
        );
        if (firstOk) {
          setGeneratedVideo(firstOk.videoUrl);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  useEffect(() => {
    if (!firstFrameDialogOpen || !authenticated) return;
    let cancelled = false;
    setLibraryLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          "/api/me/generation-records?tool=image&limit=100",
          {
            credentials: "include",
            cache: "no-store",
          },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { items?: ApiGenerationRecord[] };
        const flat: { id: string; url: string }[] = [];
        for (const row of data.items ?? []) {
          if (row.status !== "ok" || !row.result) continue;
          const imgs = row.result.images;
          if (!Array.isArray(imgs)) continue;
          imgs.forEach((u, i) => {
            if (typeof u === "string") {
              flat.push({ id: `${row.id}-${i}`, url: u });
            }
          });
        }
        if (!cancelled) setLibraryItems(flat);
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firstFrameDialogOpen, authenticated]);

  const handleGenerate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (
      !prompt.trim() ||
      isGenerating ||
      !authenticated ||
      noGenerationsLeft
    ) {
      return;
    }

    setIsGenerating(true);

    try {
      const res = await fetch("/api/generations/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          style: selectedStyle,
          aspect_ratio: selectedAspectRatio,
          duration: Number(selectedDuration),
          target_resolution: TARGET_RESOLUTION,
          ...(firstFrameUrl ? { first_frame_url: firstFrameUrl } : {}),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        video?: string;
        error?: string;
        generations?: GenerationStatus;
        record_id?: string;
      };

      if (!res.ok) {
        if (data.generations) {
          setGenerationsStatus(data.generations);
        } else {
          refreshGenerations();
        }
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const url = data.video;
      if (!url) {
        throw new Error("No video returned");
      }

      if (data.generations) {
        setGenerationsStatus(data.generations);
      } else {
        refreshGenerations();
      }

      setGeneratedVideo(url);
      setHistory((prev) => [
        {
          id: data.record_id ?? Date.now().toString(),
          prompt: prompt.trim(),
          style: selectedStyle,
          durationSec: selectedDuration,
          resolution: TARGET_RESOLUTION,
          aspectRatio: selectedAspectRatio,
          videoUrl: url,
          timestamp: new Date(),
          kind: "generate",
          recordStatus: "ok",
          firstFrameUrl: firstFrameUrl ?? undefined,
        },
        ...prev,
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate video";
      setErrorMessage(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFfFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFfUploading(true);
    setErrorMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/generations/video/first-frame-upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      if (!data.url) {
        throw new Error("No URL returned");
      }
      setFirstFrameUrl(data.url);
      setFirstFrameDialogOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to upload image";
      setErrorMessage(message);
    } finally {
      setFfUploading(false);
    }
  };

  const handleFfGenerate = async () => {
    if (!ffPrompt.trim() || ffGenLoading || !authenticated || noGenerationsLeft) {
      return;
    }
    setFfGenLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/generations/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: ffPrompt.trim(),
          style: ffStyle,
          aspect_ratio: ffRatio,
        }),
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        images?: string[];
        error?: string;
        generations?: GenerationStatus;
      };
      if (!res.ok) {
        if (data.generations) {
          setGenerationsStatus(data.generations);
        } else {
          refreshGenerations();
        }
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const url = data.images?.[0];
      if (!url) {
        throw new Error("No image returned");
      }
      if (data.generations) {
        setGenerationsStatus(data.generations);
      } else {
        refreshGenerations();
      }
      setFirstFrameUrl(url);
      setFirstFrameDialogOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate image";
      setErrorMessage(message);
    } finally {
      setFfGenLoading(false);
    }
  };

  const removeFromHistory = async (id: string) => {
    try {
      const res = await fetch(`/api/me/generation-records/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Delete failed");
      }
      setHistory((prev) => prev.filter((h) => h.id !== id));
    } catch {
      setErrorMessage("Could not remove this item from history.");
    }
  };

  const selectHistoryVideo = (url: string) => {
    if (!url) return;
    setGeneratedVideo(url);
  };

  const triggerClasses =
    "w-full h-11 bg-background/50 border-blue-500/30 text-foreground rounded-xl px-4 hover:border-blue-500/60 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/30";

  const resLabel = (code: string) =>
    code === "1080" ? "1080p" : "720p";

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-foreground mb-2 tracking-tight">
            AI Video Generation
          </h1>
          <p className="text-muted-foreground">
            Create stunning videos from text descriptions using AI
          </p>
        </div>

        <GenerationsBadge
          status={generations}
          loading={generationsLoading}
          authenticated={authenticated}
          error={generationsError}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleGenerate} className="lg:col-span-1 space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label
              htmlFor="video-prompt"
              className="text-sm font-medium text-foreground mb-3 block"
            >
              Video Prompt
            </label>
            <textarea
              id="video-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the video you want to create... (e.g., 'A drone shot flying over mountains at sunset')"
              className="w-full h-32 bg-background/50 border border-blue-500/30 rounded-xl p-4 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-blue-500/60 smooth"
            />
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5 space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">
                  First frame (optional)
                </p>
                <p className="text-xs text-muted-foreground">
                  Image-to-video: motion starts from this still.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Dialog
                  open={firstFrameDialogOpen}
                  onOpenChange={setFirstFrameDialogOpen}
                >
                  <Button
                    type="button"
                    variant="secondary"
                    className="border border-blue-500/40 bg-blue-500/10 text-foreground hover:bg-blue-500/20"
                    onClick={() => setFirstFrameDialogOpen(true)}
                  >
                    <Frame className="w-4 h-4 mr-2 shrink-0" />
                    First frame
                  </Button>
                  <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                    <DialogHeader>
                      <DialogTitle>Choose first frame</DialogTitle>
                    </DialogHeader>
                    <Tabs defaultValue="generate" className="w-full mt-2">
                      <TabsList className="grid w-full grid-cols-3 h-auto gap-1.5 rounded-xl border border-blue-500/25 bg-muted/40 p-1.5">
                        <TabsTrigger value="generate" className={ffDialogTabTriggerClass}>
                          Generate
                        </TabsTrigger>
                        <TabsTrigger value="library" className={ffDialogTabTriggerClass}>
                          Library
                        </TabsTrigger>
                        <TabsTrigger value="upload" className={ffDialogTabTriggerClass}>
                          From device
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="generate" className="pt-4 space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Creates a still using one image generation, then uses it
                          as the first frame.
                        </p>
                        <textarea
                          value={ffPrompt}
                          onChange={(e) => setFfPrompt(e.target.value)}
                          placeholder="Describe the starting image..."
                          rows={3}
                          className="w-full bg-background/50 border border-blue-500/30 rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-blue-500/60"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-2 block">
                              Style
                            </label>
                            <Select value={ffStyle} onValueChange={setFfStyle}>
                              <SelectTrigger className={triggerClasses}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ffImageStyles.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-2 block">
                              Aspect
                            </label>
                            <Select value={ffRatio} onValueChange={setFfRatio}>
                              <SelectTrigger className={triggerClasses}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ffImageRatios.map((r) => (
                                  <SelectItem key={r.id} value={r.id}>
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button
                          type="button"
                          disabled={
                            !ffPrompt.trim() ||
                            ffGenLoading ||
                            !authenticated ||
                            noGenerationsLeft
                          }
                          className="w-full bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl"
                          onClick={() => void handleFfGenerate()}
                        >
                          {ffGenLoading ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              Generating image…
                            </>
                          ) : (
                            <>
                              <ImageIcon className="w-4 h-4 mr-2" />
                              Generate image & use
                            </>
                          )}
                        </Button>
                      </TabsContent>
                      <TabsContent value="library" className="pt-4 space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Images from your past image generations.
                        </p>
                        {libraryLoading ? (
                          <p className="text-sm text-muted-foreground py-8 text-center">
                            Loading…
                          </p>
                        ) : libraryItems.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-8 text-center">
                            No images yet. Generate some on the Image page first.
                          </p>
                        ) : (
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
                            {libraryItems.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className="relative aspect-square rounded-lg overflow-hidden border border-blue-500/25 bg-black hover:border-blue-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                                onClick={() => {
                                  setFirstFrameUrl(item.url);
                                  setFirstFrameDialogOpen(false);
                                }}
                              >
                                <img
                                  src={item.url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        )}
                      </TabsContent>
                      <TabsContent value="upload" className="pt-4 space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Upload a JPEG, PNG, WebP, or GIF (max 15 MB).
                        </p>
                        <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-blue-500/40 bg-background/40 px-4 py-10 cursor-pointer hover:border-blue-500/60 smooth">
                          <ImageIcon className="w-10 h-10 text-blue-400/80" />
                          <span className="text-sm text-foreground">
                            {ffUploading ? "Uploading…" : "Click to select a file"}
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="sr-only"
                            disabled={ffUploading}
                            onChange={handleFfFileChange}
                          />
                        </label>
                      </TabsContent>
                    </Tabs>
                  </DialogContent>
                </Dialog>
                {firstFrameUrl ? (
                  <>
                    <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-blue-500/30 bg-black shrink-0">
                      <img
                        src={firstFrameUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => setFirstFrameUrl(null)}
                    >
                      Clear
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            <div>
              <label
                htmlFor="video-style"
                className="text-sm font-medium text-foreground mb-3 flex items-center gap-2"
              >
                <Palette className="w-4 h-4 text-blue-400" />
                Style
              </label>
              <Select value={selectedStyle} onValueChange={setSelectedStyle}>
                <SelectTrigger id="video-style" className={triggerClasses}>
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent>
                  {stylePresets.map((style) => (
                    <SelectItem key={style.id} value={style.id}>
                      {style.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label
                htmlFor="video-aspect"
                className="text-sm font-medium text-foreground mb-3 flex items-center gap-2"
              >
                <Ratio className="w-4 h-4 text-blue-400" />
                Aspect ratio
              </label>
              <Select
                value={selectedAspectRatio}
                onValueChange={setSelectedAspectRatio}
              >
                <SelectTrigger id="video-aspect" className={triggerClasses}>
                  <SelectValue placeholder="Select aspect ratio" />
                </SelectTrigger>
                <SelectContent>
                  {aspectRatios.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label
                htmlFor="video-duration"
                className="text-sm font-medium text-foreground mb-3 flex items-center gap-2"
              >
                <Clock className="w-4 h-4 text-blue-400" />
                Duration
              </label>
              <Select value={selectedDuration} onValueChange={setSelectedDuration}>
                <SelectTrigger id="video-duration" className={triggerClasses}>
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  {durationOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="submit"
            disabled={
              !prompt.trim() ||
              isGenerating ||
              !authenticated ||
              noGenerationsLeft
            }
            className="w-full h-12 bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl font-medium smooth shadow-lg shadow-blue-500/25 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Generating Video...
              </>
            ) : (
              <>
                <Video className="w-5 h-5 mr-2" />
                Generate Video
              </>
            )}
          </Button>

          {!authenticated && (
            <p className="text-sm text-red-400 text-center">
              Please sign in to generate videos.
            </p>
          )}

          {noGenerationsLeft && (
            <p className="text-sm text-red-400 text-center">
              You&apos;ve reached your generation limit. Upgrade your plan to keep
              creating.
            </p>
          )}

          {errorMessage && (
            <p className="text-sm text-red-400 text-center">{errorMessage}</p>
          )}
        </form>

        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5 min-h-[350px]">
            <h3 className="text-lg font-medium text-foreground mb-4">
              Generated Video
            </h3>
            {generatedVideo ? (
              <div className="space-y-4">
                <div
                  className="relative rounded-xl overflow-hidden border border-blue-500/20 bg-black"
                  style={{
                    aspectRatio:
                      selectedAspectRatio === "9:16"
                        ? "9 / 16"
                        : selectedAspectRatio === "1:1"
                          ? "1 / 1"
                          : "16 / 9",
                  }}
                >
                  <video
                    src={generatedVideo}
                    controls
                    playsInline
                    className="w-full h-full object-contain max-h-[min(70vh,560px)]"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <Button
                    className="bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-lg"
                    asChild
                  >
                    <a
                      href={generatedVideo}
                      download
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Video
                    </a>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                  <Video className="w-10 h-10 text-blue-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No video generated yet
                </h3>
                <p className="text-muted-foreground max-w-sm">
                  Enter a prompt and click generate to create AI-powered videos
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <h3 className="text-lg font-medium text-foreground mb-4">
              Previous Generations
            </h3>
            {historyLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Loading history…
              </p>
            ) : history.length > 0 ? (
              <div className="space-y-3">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth group"
                  >
                    <button
                      type="button"
                      className="relative w-24 h-14 rounded-lg overflow-hidden shrink-0 cursor-pointer hover:opacity-80 smooth bg-black disabled:opacity-50 disabled:cursor-not-allowed"
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
                      <p className="text-sm text-foreground truncate">
                        {item.prompt}
                      </p>
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
                            {stylePresets.find((s) => s.id === item.style)
                              ?.label}{" "}
                            | {item.durationSec}s | {resLabel(item.resolution)} |{" "}
                            {item.aspectRatio}
                            {item.firstFrameUrl ? (
                              <span className="text-foreground/80">
                                {" "}
                                · first frame
                              </span>
                            ) : null}
                          </>
                        )}{" "}
                        | {item.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title="Show in preview"
                        onClick={() => selectHistoryVideo(item.videoUrl)}
                        disabled={!item.videoUrl}
                        className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <Video className="w-4 h-4" />
                      </button>
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
                        onClick={() => removeFromHistory(item.id)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No previous generations
              </p>
            )}
          </div>
        </div>
      </div>

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
            <div className="flex justify-center mt-4">
              <Button
                className="bg-white text-black hover:bg-white/90 rounded-xl shadow-lg"
                asChild
              >
                <a
                  href={lightboxVideo}
                  download
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Video
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
