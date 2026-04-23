"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import {
  Video,
  Download,
  RefreshCw,
  Clock,
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
import { useAuth } from "@/components/auth-provider";
import { CreatorAiGateModal } from "@/components/creator-ai-gate-modal";
import { SignInModal } from "@/components/sign-in-modal";
import { useCreatorAiGateAfterSignIn } from "@/hooks/use-creator-ai-gate-after-sign-in";
import { useGenerations, type GenerationStatus } from "@/hooks/use-generations";
import { GenerationsBadge } from "@/components/generations-badge";
import {
  CREATOR_AI_REQUIRED_CODE,
  getAiGenerateBlockReason,
} from "@/lib/ai-generation-gate";
import { replicateFileUrlToDisplaySrc } from "@/lib/replicate-file-display-url";
import { VideoLightbox } from "@/components/video-generator/video-lightbox";
import { RecentVideosList } from "@/components/video-generator/recent-videos-list";

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

export interface RecentVideo {
  id: string;
  url: string;
  aspectRatio: string;
  prompt: string;
  style: string;
  durationSec: string;
}

export const stylePresets = [
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

const triggerClasses =
  "w-full h-11 bg-background/50 border-blue-500/30 text-foreground rounded-xl px-4 hover:border-blue-500/60 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/30";

type ApiGenerationRecord = {
  id: string;
  status: string;
  settings: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

const KNOWN_VIDEO_STYLES = new Set(stylePresets.map((s) => s.id));
const KNOWN_VIDEO_RATIOS = new Set(aspectRatios.map((r) => r.id));
const KNOWN_VIDEO_DURATIONS = new Set(durationOptions.map((d) => d.id));

function recordsToRecentVideos(rows: ApiGenerationRecord[]): RecentVideo[] {
  const out: RecentVideo[] = [];
  for (const row of rows) {
    if (row.status !== "ok" || !row.result) continue;
    const url = row.result.video;
    if (typeof url !== "string" || !url) continue;
    const s = row.settings;
    const aspectRatio =
      typeof s.aspect_ratio === "string" && KNOWN_VIDEO_RATIOS.has(s.aspect_ratio)
        ? s.aspect_ratio
        : "16:9";
    const style =
      typeof s.style === "string" && KNOWN_VIDEO_STYLES.has(s.style)
        ? s.style
        : "realistic";
    const rawDuration = String(s.duration ?? "5");
    const durationSec = KNOWN_VIDEO_DURATIONS.has(rawDuration)
      ? rawDuration
      : "5";
    out.push({
      id: row.id,
      url,
      aspectRatio,
      prompt: typeof s.prompt === "string" ? s.prompt : "",
      style,
      durationSec,
    });
  }
  return out;
}

export function VideoGenerator() {
  const { user } = useAuth();
  const {
    status: generations,
    loading: generationsLoading,
    error: generationsError,
    authenticated,
    setStatus: setGenerationsStatus,
    refresh: refreshGenerations,
  } = useGenerations();

  const [signInOpen, setSignInOpen] = useState(false);
  const [creatorAiGateOpen, setCreatorAiGateOpen] = useState(false);
  const [creatorAiVariant, setCreatorAiVariant] = useState<
    "subscribe" | "upgrade"
  >("subscribe");

  const { markGuestWantedGenerate } = useCreatorAiGateAfterSignIn(
    user,
    generations,
    generationsLoading,
    signInOpen,
    setCreatorAiGateOpen,
    setCreatorAiVariant,
  );

  const [prompt, setPrompt] = useState("");
  const [selectedDuration, setSelectedDuration] = useState("5");
  const [selectedAspectRatio, setSelectedAspectRatio] = useState("16:9");
  const [selectedStyle, setSelectedStyle] = useState("realistic");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [lightboxVideo, setLightboxVideo] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);

  const refreshRecentVideos = useCallback(async () => {
    if (!user) {
      setRecentVideos([]);
      return;
    }
    try {
      const res = await fetch(
        "/api/me/generation-records?tool=video&limit=5",
        { credentials: "include", cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { items?: ApiGenerationRecord[] };
      setRecentVideos(recordsToRecentVideos(data.items ?? []).slice(0, 2));
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    void refreshRecentVideos();
  }, [refreshRecentVideos]);

  const deleteRecentVideo = useCallback(
    async (id: string) => {
      setRecentVideos((prev) => prev.filter((it) => it.id !== id));
      try {
        await fetch(`/api/me/generation-records/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
      } catch {
        void refreshRecentVideos();
      }
    },
    [refreshRecentVideos],
  );

  const repeatRecentVideo = useCallback((item: RecentVideo) => {
    setPrompt(item.prompt);
    setSelectedStyle(item.style);
    setSelectedAspectRatio(item.aspectRatio);
    setSelectedDuration(item.durationSec);
    setErrorMessage(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  /**
   * Runs the generation gate check and triggers the appropriate UI response.
   * Returns true if the caller is clear to proceed, false if blocked.
   */
  const checkGenerationGate = useCallback((): boolean => {
    const block = getAiGenerateBlockReason(user, generations, generationsLoading);
    if (block === "sign_in") {
      markGuestWantedGenerate();
      setSignInOpen(true);
      return false;
    }
    if (block === "needs_creator_ai") {
      setCreatorAiVariant(
        generations?.plan === "creator" ? "upgrade" : "subscribe",
      );
      setCreatorAiGateOpen(true);
      return false;
    }
    if (block === "limit") {
      setErrorMessage(
        "You've reached your generation limit for this period. See pricing for options.",
      );
      return false;
    }
    return true;
  }, [
    user,
    generations,
    generationsLoading,
    markGuestWantedGenerate,
    setSignInOpen,
    setCreatorAiVariant,
    setCreatorAiGateOpen,
    setErrorMessage,
  ]);

  const handle403CreatorAiGate = useCallback(
    (responsePlan?: string): void => {
      void refreshGenerations();
      setCreatorAiVariant(responsePlan === "creator" ? "upgrade" : "subscribe");
      setCreatorAiGateOpen(true);
    },
    [refreshGenerations, setCreatorAiVariant, setCreatorAiGateOpen],
  );

  const syncGenerations = useCallback(
    (genStatus?: GenerationStatus): void => {
      if (genStatus) {
        setGenerationsStatus(genStatus);
      } else {
        refreshGenerations();
      }
    },
    [setGenerationsStatus, refreshGenerations],
  );

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
  const atLimitForCreatorAi =
    user &&
    generations?.plan === "creator_ai" &&
    !generationsLoading &&
    remaining <= 0;

  useEffect(() => {
    if (!firstFrameDialogOpen || !user) return;
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
  }, [firstFrameDialogOpen, user?.id]);

  const handleGenerate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!prompt.trim() || isGenerating || generationsLoading) {
      return;
    }

    if (!checkGenerationGate()) return;

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
        code?: string;
        plan?: string;
        generations?: GenerationStatus;
        record_id?: string;
      };

      if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
        handle403CreatorAiGate(data.plan);
        return;
      }

      if (!res.ok) {
        syncGenerations(data.generations);
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const url = data.video;
      if (!url) {
        throw new Error("No video returned");
      }

      syncGenerations(data.generations);

      setGeneratedVideo(url);
      void refreshRecentVideos();
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
    setErrorMessage(null);
    if (!checkGenerationGate()) return;

    setFfUploading(true);
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
        code?: string;
        plan?: string;
      };
      if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
        handle403CreatorAiGate(data.plan);
        return;
      }
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
    if (!ffPrompt.trim() || ffGenLoading || generationsLoading) {
      return;
    }

    if (!checkGenerationGate()) return;

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
        code?: string;
        plan?: string;
        generations?: GenerationStatus;
      };
      if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
        handle403CreatorAiGate(data.plan);
        return;
      }
      if (!res.ok) {
        syncGenerations(data.generations);
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const url = data.images?.[0];
      if (!url) {
        throw new Error("No image returned");
      }
      syncGenerations(data.generations);
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
                            !ffPrompt.trim() || ffGenLoading || generationsLoading
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
                        src={replicateFileUrlToDisplaySrc(firstFrameUrl)}
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
            disabled={!prompt.trim() || isGenerating || generationsLoading}
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

          {atLimitForCreatorAi && (
            <p className="text-sm text-red-400 text-center">
              You&apos;ve reached your generation limit for this period. See
              pricing for options.
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
                <div className="flex justify-center">
                  <video
                    src={generatedVideo}
                    controls
                    playsInline
                    className="block max-w-full h-auto max-h-[420px] w-auto rounded-xl border border-blue-500/20"
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

          {user && recentVideos.length > 0 ? (
            <RecentVideosList
              videos={recentVideos}
              onOpenLightbox={(url) => setLightboxVideo(url)}
              onRepeat={repeatRecentVideo}
              onDelete={deleteRecentVideo}
            />
          ) : null}
        </div>
      </div>

      <SignInModal
        open={signInOpen}
        onOpenChange={setSignInOpen}
        onAuthSuccess={() => setSignInOpen(false)}
      />
      <CreatorAiGateModal
        open={creatorAiGateOpen}
        onOpenChange={setCreatorAiGateOpen}
        variant={creatorAiVariant}
      />

      {lightboxVideo && (
        <VideoLightbox
          videoUrl={lightboxVideo}
          onClose={() => setLightboxVideo(null)}
        />
      )}
    </div>
  );
}
