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
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/components/auth-provider";
import { CreatorAiGateModal } from "@/components/creator-ai-gate-modal";
import { SignInModal } from "@/components/sign-in-modal";
import { useCreatorAiGateAfterSignIn } from "@/hooks/use-creator-ai-gate-after-sign-in";
import {
  useGenerations,
  normalizeGenerationStatus,
  type GenerationStatus,
} from "@/hooks/use-generations";
import { useExtraGenerationsPurchase } from "@/hooks/use-extra-generations-purchase";
import { AiToolPageHeader } from "@/components/ai-tool-page-header";
import { BuyExtraGenerationsDialog } from "@/components/buy-extra-generations-dialog";
import {
  CREATOR_AI_REQUIRED_CODE,
  GENERATION_LIMIT_REACHED_CODE,
  getAiGenerateBlockReason,
} from "@/lib/ai-generation-gate";
import { replicateFileUrlToDisplaySrc } from "@/lib/replicate-file-display-url";
import { VideoLightbox } from "@/components/video-generator/video-lightbox";
import { RecentVideosList } from "@/components/video-generator/recent-videos-list";
import { FirstFrameDialog } from "@/components/video-generator/first-frame-dialog";
import { triggerClasses } from "@/components/video-generator/styles";

const TARGET_RESOLUTION = "720" as const;

const durationOptions = [
  { id: "5", label: "5 sec" },
  { id: "8", label: "8 sec" },
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
  audioEnabled: boolean;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
}

export const stylePresets = [
  { id: "cinematic", label: "Cinematic" },
  { id: "anime", label: "Anime" },
  { id: "realistic", label: "Realistic" },
  { id: "artistic", label: "Artistic" },
];

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
    const audioEnabled =
      typeof s.audio_enabled === "boolean" ? s.audio_enabled : true;
    const firstFrameUrl =
      typeof s.first_frame_url === "string" ? s.first_frame_url : undefined;
    const lastFrameUrl =
      typeof s.last_frame_url === "string" ? s.last_frame_url : undefined;
    out.push({
      id: row.id,
      url,
      aspectRatio,
      prompt: typeof s.prompt === "string" ? s.prompt : "",
      style,
      durationSec,
      audioEnabled,
      firstFrameUrl,
      lastFrameUrl,
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

  const {
    buyOpen,
    setBuyOpen,
    openBuyDialog,
    selectedCount,
    setSelectedCount,
    continuePurchase,
    checkoutLoading,
    purchaseDisabled,
  } = useExtraGenerationsPurchase({ onSuccess: refreshGenerations });

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
  const [audioEnabled, setAudioEnabled] = useState(true);
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
    setAudioEnabled(item.audioEnabled);
    setFirstFrameUrl(item.firstFrameUrl ?? null);
    setLastFrameUrl(item.lastFrameUrl ?? null);
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
      openBuyDialog();
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
    openBuyDialog,
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
  const [lastFrameUrl, setLastFrameUrl] = useState<string | null>(null);
  const [framePickerSlot, setFramePickerSlot] = useState<"first" | "last" | null>(
    null,
  );

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
          audio_enabled: audioEnabled,
          ...(firstFrameUrl ? { first_frame_url: firstFrameUrl } : {}),
          ...(lastFrameUrl ? { last_frame_url: lastFrameUrl } : {}),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        video?: string;
        error?: string;
        code?: string;
        plan?: string;
        generations?: GenerationStatus;
        record_id?: string;
      } & Partial<GenerationStatus>;

      if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
        handle403CreatorAiGate(data.plan);
        return;
      }

      if (res.status === 402 && data.code === GENERATION_LIMIT_REACHED_CODE) {
        syncGenerations(normalizeGenerationStatus(data));
        openBuyDialog();
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

  return (
    <div className="max-w-7xl mx-auto">
      <AiToolPageHeader
        title="AI Video Generation"
        description="Create stunning videos from text descriptions using AI"
        status={generations}
        loading={generationsLoading}
        authenticated={authenticated}
        error={generationsError}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <form onSubmit={handleGenerate} className="lg:col-span-1 space-y-3 lg:space-y-6">
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
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">Frames (optional)</p>
                <p className="text-xs text-muted-foreground">
                  Optional reference images for the first and last frames. PNG, JPEG, or WebP.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative mx-auto w-full max-w-[180px]">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      setFramePickerSlot("first");
                    }}
                    className="flex aspect-square w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-blue-500/30 bg-background/35 text-left transition-colors hover:border-blue-500/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                  >
                    <div className="relative flex min-h-0 flex-1 flex-col">
                      {firstFrameUrl ? (
                        <img
                          src={replicateFileUrlToDisplaySrc(firstFrameUrl)}
                          alt="First frame"
                          className="h-full w-full flex-1 object-cover"
                        />
                      ) : (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 text-muted-foreground/70">
                          <ImageIcon className="h-8 w-8" />
                          <span className="text-xs font-medium text-foreground/90 text-center leading-snug">
                            First frame
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                  {firstFrameUrl ? (
                    <button
                      type="button"
                      aria-label="Clear first frame"
                      className="absolute right-1 top-1 z-10 h-7 w-7 cursor-pointer rounded-full border border-blue-500/35 bg-background/80 p-0 text-muted-foreground leading-none backdrop-blur-sm transition-colors hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFirstFrameUrl(null);
                      }}
                    >
                      <X className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2" />
                    </button>
                  ) : null}
                </div>

                <div className="relative mx-auto w-full max-w-[180px]">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      setFramePickerSlot("last");
                    }}
                    className="flex aspect-square w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-blue-500/30 bg-background/35 text-left transition-colors hover:border-blue-500/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                  >
                    <div className="relative flex min-h-0 flex-1 flex-col">
                      {lastFrameUrl ? (
                        <img
                          src={replicateFileUrlToDisplaySrc(lastFrameUrl)}
                          alt="Last frame"
                          className="h-full w-full flex-1 object-cover"
                        />
                      ) : (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 text-muted-foreground/70">
                          <ImageIcon className="h-8 w-8" />
                          <span className="text-xs font-medium text-foreground/90 text-center leading-snug">
                            Last frame
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                  {lastFrameUrl ? (
                    <button
                      type="button"
                      aria-label="Clear last frame"
                      className="absolute right-1 top-1 z-10 h-7 w-7 cursor-pointer rounded-full border border-blue-500/35 bg-background/80 p-0 text-muted-foreground leading-none backdrop-blur-sm transition-colors hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLastFrameUrl(null);
                      }}
                    >
                      <X className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2" />
                    </button>
                  ) : null}
                </div>
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
              <div className="flex items-center justify-between rounded-xl border border-blue-500/30 bg-background/40 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Audio</p>
                  <p className="text-xs text-muted-foreground">
                    Generate video with sound
                  </p>
                </div>
                <Switch
                  id="video-audio"
                  checked={audioEnabled}
                  onCheckedChange={setAudioEnabled}
                  aria-label="Toggle video audio"
                />
              </div>
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

          {errorMessage && (
            <p className="text-sm text-red-400 text-center">{errorMessage}</p>
          )}
        </form>

        <FirstFrameDialog
          open={framePickerSlot !== null}
          onOpenChange={(open) => {
            if (!open) setFramePickerSlot(null);
          }}
          dialogTitle={
            framePickerSlot === "last"
              ? "Choose last frame (optional)"
              : "Choose first frame (optional)"
          }
          generateDescription={
            framePickerSlot === "last"
              ? "Creates an image and uses it as the last-frame reference."
              : "Creates a still using one image generation, then uses it as the first frame."
          }
          onFrameSelected={(url) => {
            if (framePickerSlot === "last") {
              setLastFrameUrl(url);
            } else {
              setFirstFrameUrl(url);
            }
            setFramePickerSlot(null);
          }}
          userId={user?.id}
          checkGate={checkGenerationGate}
          onCreatorAiGate={handle403CreatorAiGate}
          syncGenerations={syncGenerations}
          onError={setErrorMessage}
          generationsLoading={generationsLoading}
        />

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

      <BuyExtraGenerationsDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        selectedCount={selectedCount}
        onSelectCount={setSelectedCount}
        onContinue={continuePurchase}
        continueLoading={checkoutLoading}
        continueDisabled={purchaseDisabled}
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
