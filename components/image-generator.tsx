"use client";

import Link from "next/link";
import { useState, useEffect, type FormEvent } from "react";
import {
  Wand2,
  Download,
  RefreshCw,
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

function ratioIdToCssAspect(ratioId: string): string {
  if (ratioId === "9:16") return "9 / 16";
  if (ratioId === "1:1") return "1 / 1";
  return "16 / 9";
}

interface GenerationHistory {
  id: string;
  prompt: string;
  style: string;
  ratio: string;
  images: string[];
  timestamp: Date;
  recordStatus?: "ok" | "failed";
  errorMessage?: string;
}

type ApiGenerationRecord = {
  id: string;
  status: string;
  settings: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

function mapImageRecord(row: ApiGenerationRecord): GenerationHistory {
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
  const [previewRatio, setPreviewRatio] = useState("1:1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const remaining = generations?.remaining ?? 0;
  const atLimitForCreatorAi =
    user &&
    generations?.plan === "creator_ai" &&
    !generationsLoading &&
    remaining <= 0;

  useEffect(() => {
    if (!user) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/generation-records?tool=image&limit=100", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { items?: ApiGenerationRecord[] };
        const mapped = (data.items ?? []).map(mapImageRecord);
        if (cancelled) return;
        const firstOk = mapped.find(
          (h) => h.recordStatus === "ok" && h.images.length > 0,
        );
        if (firstOk) {
          setGeneratedImages(firstOk.images);
          setPreviewRatio(firstOk.ratio);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
      setPreviewRatio(selectedRatio);
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
                <div
                  className="relative rounded-xl overflow-hidden border border-blue-500/20 bg-black cursor-pointer"
                  style={{
                    aspectRatio: ratioIdToCssAspect(previewRatio),
                  }}
                  onClick={() => setLightboxImage(generatedImages[0])}
                >
                  <img
                    src={generatedImages[0]}
                    alt="Generated image"
                    className="w-full h-full object-contain max-h-[min(70vh,560px)]"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <Button
                    className="bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-lg"
                    asChild
                  >
                    <a
                      href={generatedImages[0]}
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
          {user ? (
            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/profile/generations"
                className="text-blue-400 hover:underline"
              >
                View all generations
              </Link>
            </p>
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
              src={lightboxImage}
              alt="Generated image"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl border border-blue-500/30"
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <Button
                className="bg-white text-black hover:bg-white/90 rounded-xl shadow-lg"
                asChild
              >
                <a href={lightboxImage} download target="_blank" rel="noreferrer">
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
