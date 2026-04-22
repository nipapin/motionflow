"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, type FormEvent } from "react";
import {
  Wand2,
  Download,
  RefreshCw,
  ImageIcon,
  X,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const stylePresets = [
  { id: "realistic", label: "Realistic" },
  { id: "anime", label: "Anime" },
  { id: "3d", label: "3D Render" },
  { id: "digital-art", label: "Digital Art" },
  { id: "oil-painting", label: "Oil Painting" },
  { id: "watercolor", label: "Watercolor" },
];

const aspectRatios = [
  { id: "1:1", label: "1:1 — Square" },
  { id: "16:9", label: "16:9 — Widescreen" },
  { id: "9:16", label: "9:16 — Portrait" },
  // { id: "4:3", label: "4:3 — Standard" },
  // { id: "3:4", label: "3:4 — Vertical" },
  // { id: "3:2", label: "3:2 — Photo" },
  // { id: "2:3", label: "2:3 — Photo Portrait" },
  // { id: "21:9", label: "21:9 — Cinematic" },
];

type ApiGenerationRecord = {
  id: string;
  status: string;
  settings: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

interface RecentImage {
  id: string;
  url: string;
  prompt: string;
  style: string;
  ratio: string;
}

const KNOWN_STYLES = new Set(stylePresets.map((s) => s.id));
const KNOWN_RATIOS = new Set(aspectRatios.map((r) => r.id));

function recordsToRecentImages(rows: ApiGenerationRecord[]): RecentImage[] {
  const out: RecentImage[] = [];
  for (const row of rows) {
    if (row.status !== "ok" || !row.result) continue;
    const imgs = row.result.images;
    if (!Array.isArray(imgs)) continue;
    const first = imgs.find((u): u is string => typeof u === "string");
    if (!first) continue;
    const s = row.settings;
    out.push({
      id: row.id,
      url: first,
      prompt: typeof s.prompt === "string" ? s.prompt : "",
      style:
        typeof s.style === "string" && KNOWN_STYLES.has(s.style)
          ? s.style
          : "realistic",
      ratio:
        typeof s.aspect_ratio === "string" && KNOWN_RATIOS.has(s.aspect_ratio)
          ? s.aspect_ratio
          : "1:1",
    });
  }
  return out;
}

export function ImageGenerator() {
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
  const [selectedStyle, setSelectedStyle] = useState("realistic");
  const [selectedRatio, setSelectedRatio] = useState("1:1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentImages, setRecentImages] = useState<RecentImage[]>([]);

  const refreshRecent = useCallback(async () => {
    if (!user) {
      setRecentImages([]);
      return;
    }
    try {
      const res = await fetch(
        "/api/me/generation-records?tool=image&limit=5",
        { credentials: "include", cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { items?: ApiGenerationRecord[] };
      setRecentImages(recordsToRecentImages(data.items ?? []).slice(0, 2));
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  const deleteRecent = useCallback(async (id: string) => {
    setRecentImages((prev) => prev.filter((it) => it.id !== id));
    try {
      await fetch(`/api/me/generation-records/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch {
      void refreshRecent();
    }
  }, [refreshRecent]);

  const repeatRecent = useCallback((item: RecentImage) => {
    setPrompt(item.prompt);
    setSelectedStyle(item.style);
    setSelectedRatio(item.ratio);
    setErrorMessage(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const remaining = generations?.remaining ?? 0;
  const atLimitForCreatorAi =
    user &&
    generations?.plan === "creator_ai" &&
    !generationsLoading &&
    remaining <= 0;

  const handleGenerate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!prompt.trim() || isGenerating || generationsLoading) {
      return;
    }

    const block = getAiGenerateBlockReason(
      user,
      generations,
      generationsLoading,
    );
    if (block === "sign_in") {
      markGuestWantedGenerate();
      setSignInOpen(true);
      return;
    }
    if (block === "needs_creator_ai") {
      setCreatorAiVariant(
        generations?.plan === "creator" ? "upgrade" : "subscribe",
      );
      setCreatorAiGateOpen(true);
      return;
    }
    if (block === "limit") {
      setErrorMessage(
        "You've reached your generation limit. Upgrade or wait for the next billing period.",
      );
      return;
    }

    setIsGenerating(true);

    try {
      const res = await fetch("/api/generations/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          style: selectedStyle,
          aspect_ratio: selectedRatio,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        images?: string[];
        error?: string;
        code?: string;
        plan?: string;
        generations?: GenerationStatus;
        record_id?: string;
      };

      if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
        void refreshGenerations();
        setCreatorAiVariant(data.plan === "creator" ? "upgrade" : "subscribe");
        setCreatorAiGateOpen(true);
        return;
      }

      if (!res.ok) {
        if (data.generations) {
          setGenerationsStatus(data.generations);
        } else {
          refreshGenerations();
        }
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const images = data.images ?? [];
      if (!images.length) {
        throw new Error("No images returned");
      }

      if (data.generations) {
        setGenerationsStatus(data.generations);
      } else {
        refreshGenerations();
      }
      setGeneratedImages(images);
      void refreshRecent();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate image";
      setErrorMessage(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const triggerClasses =
    "w-full h-11 bg-background/50 border-blue-500/30 text-foreground rounded-xl px-4 hover:border-blue-500/60 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/30";

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-foreground mb-2 tracking-tight">
            AI Image Generation
          </h1>
          <p className="text-muted-foreground">
            Create stunning images from text descriptions using AI
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
              htmlFor="image-prompt"
              className="text-sm font-medium text-foreground mb-3 block"
            >
              Prompt
            </label>
            <textarea
              id="image-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to create..."
              className="w-full h-32 bg-background/50 border border-blue-500/30 rounded-xl p-4 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-blue-500/60 smooth"
            />
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label
              htmlFor="image-style"
              className="text-sm font-medium text-foreground mb-3 block"
            >
              Style
            </label>
            <Select value={selectedStyle} onValueChange={setSelectedStyle}>
              <SelectTrigger id="image-style" className={triggerClasses}>
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

          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label
              htmlFor="image-ratio"
              className="text-sm font-medium text-foreground mb-3 block"
            >
              Aspect Ratio
            </label>
            <Select value={selectedRatio} onValueChange={setSelectedRatio}>
              <SelectTrigger id="image-ratio" className={triggerClasses}>
                <SelectValue placeholder="Select aspect ratio" />
              </SelectTrigger>
              <SelectContent>
                {aspectRatios.map((ratio) => (
                  <SelectItem key={ratio.id} value={ratio.id}>
                    {ratio.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            disabled={!prompt.trim() || isGenerating || generationsLoading}
            className="w-full h-12 bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl font-medium smooth shadow-lg shadow-blue-500/25 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="w-5 h-5 mr-2" />
                Generate
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
              Generated Images
            </h3>
            {generatedImages.length > 0 ? (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxImage(
                        replicateFileUrlToDisplaySrc(generatedImages[0]),
                      )
                    }
                    className="block max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 rounded-xl"
                  >
                    <img
                      src={replicateFileUrlToDisplaySrc(generatedImages[0])}
                      alt="Generated image"
                      className="block max-w-full h-auto max-h-[420px] w-auto rounded-xl border border-blue-500/20"
                    />
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <Button
                    className="bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-lg"
                    asChild
                  >
                    <a
                      href={replicateFileUrlToDisplaySrc(generatedImages[0])}
                      download
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Image
                    </a>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                  <ImageIcon className="w-10 h-10 text-blue-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No images generated yet
                </h3>
                <p className="text-muted-foreground max-w-sm">
                  Enter a prompt and click generate to create AI-powered images
                </p>
              </div>
            )}
          </div>

          {user && recentImages.length > 0 ? (
            <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-foreground">
                  Recent generations
                </h3>
                <Link
                  href="/profile/generations?tab=image"
                  className="text-sm text-blue-400 hover:underline"
                >
                  View all
                </Link>
              </div>
              <ul className="space-y-2">
                {recentImages.map((item) => {
                  const displaySrc = replicateFileUrlToDisplaySrc(item.url);
                  const styleLabel =
                    stylePresets.find((s) => s.id === item.style)?.label ??
                    item.style;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 p-2 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth"
                    >
                      <button
                        type="button"
                        onClick={() => setLightboxImage(displaySrc)}
                        className="w-14 h-14 shrink-0 rounded-lg overflow-hidden border border-blue-500/20 hover:opacity-80 smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                      >
                        <img
                          src={displaySrc}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm text-foreground truncate"
                          title={item.prompt}
                        >
                          {item.prompt || "Untitled"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {styleLabel} · {item.ratio}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => repeatRecent(item)}
                          title="Repeat with same settings"
                          aria-label="Repeat generation"
                          className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <a
                          href={displaySrc}
                          download
                          target="_blank"
                          rel="noreferrer"
                          title="Download"
                          aria-label="Download image"
                          className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => void deleteRecent(item.id)}
                          title="Delete"
                          aria-label="Delete generation"
                          className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
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

      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxImage(null)}
        >
          <button
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
              alt="Generated image"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl border border-blue-500/30"
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <Button
                className="bg-white text-black hover:bg-white/90 rounded-xl shadow-lg"
                asChild
              >
                <a
                  href={replicateFileUrlToDisplaySrc(lightboxImage)}
                  download
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
