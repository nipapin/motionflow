"use client";

import Link from "next/link";
import {
  useState,
  useEffect,
  useCallback,
  type FormEvent,
} from "react";
import {
  Pencil,
  Download,
  RefreshCw,
  ImageIcon,
  X,
  Trash2,
  RotateCcw,
  Eraser,
  Maximize2,
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
import { cn } from "@/lib/utils";
import { FirstFrameDialog } from "@/components/video-generator/first-frame-dialog";

export type SuiteToolId = "prompt_edit" | "remove_bg" | "upscale";

const SUITE_TOOLS: {
  id: SuiteToolId;
  label: string;
  icon: typeof Pencil;
}[] = [
  {
    id: "prompt_edit",
    label: "Prompt image edit",
    icon: Pencil,
  },
  {
    id: "remove_bg",
    label: "Remove background",
    icon: Eraser,
  },
  {
    id: "upscale",
    label: "Upscale image",
    icon: Maximize2,
  },
];

const aspectRatios = [
  { id: "match_input_image", label: "Match source image" },
  { id: "1:1", label: "1 : 1" },
  { id: "9:16", label: "9:16" },
  { id: "16:9", label: "16/9" },
];

const KNOWN_RATIOS = new Set(aspectRatios.map((r) => r.id));

type ApiGenerationRecord = {
  id: string;
  tool?: string;
  status: string;
  settings: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

interface RecentSuiteItem {
  id: string;
  url: string;
  suiteTool: SuiteToolId;
  prompt: string;
  ratio: string;
  contentModeration: boolean;
  upscaleFactor: number;
  /** MIME from upload, for upscale repeat / output format hint */
  sourceContentType: string | null;
  sourceImages: string[];
}

function settingsToSourceContentType(
  s: Record<string, unknown>,
): string | null {
  if (
    typeof s.source_content_type === "string" &&
    s.source_content_type.trim()
  ) {
    return s.source_content_type.trim();
  }
  const fmt = s.output_format;
  if (fmt === "png") return "image/png";
  if (fmt === "webp") return "image/webp";
  if (fmt === "jpg" || fmt === "jpeg") return "image/jpeg";
  return null;
}

function parseSuiteTool(row: ApiGenerationRecord): SuiteToolId {
  const t = row.tool;
  if (t === "image_remove_bg") return "remove_bg";
  if (t === "image_upscale") return "upscale";
  const s = row.settings?.suite_tool;
  if (s === "remove_bg") return "remove_bg";
  if (s === "upscale") return "upscale";
  return "prompt_edit";
}

function recordsToRecentSuite(rows: ApiGenerationRecord[]): RecentSuiteItem[] {
  const out: RecentSuiteItem[] = [];
  for (const row of rows) {
    if (row.status !== "ok" || !row.result) continue;
    const imgs = row.result.images;
    if (!Array.isArray(imgs)) continue;
    const first = imgs.find((u): u is string => typeof u === "string");
    if (!first) continue;
    const s = row.settings;
    const src = s.source_images;
    const sourceImages = Array.isArray(src)
      ? src.filter((u): u is string => typeof u === "string")
      : [];
    const suiteTool = parseSuiteTool(row);
    const rawFactor = typeof s.factor === "number" ? s.factor : 2;
    const upscaleFactor = [2, 4, 8].includes(rawFactor) ? rawFactor : 2;
    out.push({
      id: row.id,
      url: first,
      suiteTool,
      prompt: typeof s.prompt === "string" ? s.prompt : "",
      ratio:
        typeof s.aspect_ratio === "string" && KNOWN_RATIOS.has(s.aspect_ratio)
          ? s.aspect_ratio
          : "match_input_image",
      contentModeration: s.content_moderation === true,
      upscaleFactor,
      sourceContentType: settingsToSourceContentType(s),
      sourceImages,
    });
  }
  return out;
}

export function ImageEditor() {
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

  const [activeTool, setActiveTool] = useState<SuiteToolId>("prompt_edit");

  const [prompt, setPrompt] = useState("");
  const [selectedRatio, setSelectedRatio] = useState("match_input_image");
  const [primaryUrl, setPrimaryUrl] = useState<string | null>(null);
  /** Set from upload `content_type` (JPEG/PNG/WebP) for upscale output format. */
  const [primarySourceMime, setPrimarySourceMime] = useState<string | null>(
    null,
  );
  const [secondaryUrl, setSecondaryUrl] = useState<string | null>(null);
  const [sourcePickerSlot, setSourcePickerSlot] = useState<
    "primary" | "secondary" | null
  >(null);

  /** Scale factor only: 2×, 4×, or 8× (API always uses factor mode). */
  const [scaleFactor, setScaleFactor] = useState<"2" | "4" | "8">("2");

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentItems, setRecentItems] = useState<RecentSuiteItem[]>([]);

  const refreshRecent = useCallback(async () => {
    if (!user) {
      setRecentItems([]);
      return;
    }
    try {
      const [rEdit, rRm, rUp] = await Promise.all([
        fetch("/api/me/generation-records?tool=image_edit&limit=12", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/me/generation-records?tool=image_remove_bg&limit=12", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/me/generation-records?tool=image_upscale&limit=12", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      if (!rEdit.ok || !rRm.ok || !rUp.ok) return;
      const [dEdit, dRm, dUp] = (await Promise.all([
        rEdit.json(),
        rRm.json(),
        rUp.json(),
      ])) as Array<{ items?: ApiGenerationRecord[] }>;
      const merged = [
        ...(dEdit.items ?? []),
        ...(dRm.items ?? []),
        ...(dUp.items ?? []),
      ].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setRecentItems(recordsToRecentSuite(merged).slice(0, 6));
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  useEffect(() => {
    if (activeTool !== "prompt_edit") {
      setSecondaryUrl(null);
    }
  }, [activeTool]);

  const deleteRecent = useCallback(
    async (id: string) => {
      setRecentItems((prev) => prev.filter((it) => it.id !== id));
      try {
        await fetch(`/api/me/generation-records/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
      } catch {
        void refreshRecent();
      }
    },
    [refreshRecent],
  );

  const repeatRecent = useCallback((item: RecentSuiteItem) => {
    setActiveTool(item.suiteTool);
    setPrompt(item.prompt);
    setSelectedRatio(item.ratio);
    setPrimaryUrl(item.sourceImages[0] ?? null);
    setSecondaryUrl(item.sourceImages[1] ?? null);
    setScaleFactor(
      item.upscaleFactor === 8
        ? "8"
        : item.upscaleFactor === 4
          ? "4"
          : "2",
    );
    setPrimarySourceMime(item.sourceContentType);
    setErrorMessage(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

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

  const runSuiteRequest = async (
    url: string,
    init: RequestInit,
  ): Promise<void> => {
    const res = await fetch(url, { ...init, credentials: "include" });
    const data = (await res.json().catch(() => ({}))) as {
      images?: string[];
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

    const imgs = data.images ?? [];
    if (!imgs.length) throw new Error("No image returned");

    syncGenerations(data.generations);
    setGeneratedImages(imgs);
    void refreshRecent();
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (isGenerating || generationsLoading) return;
    if (!primaryUrl) {
      setErrorMessage("Upload a source image first.");
      return;
    }

    if (activeTool === "prompt_edit") {
      if (!prompt.trim()) {
        setErrorMessage("Enter an edit prompt.");
        return;
      }
    }

    if (!checkGenerationGate()) return;

    setIsGenerating(true);
    try {
      if (activeTool === "prompt_edit") {
        const images = [primaryUrl, ...(secondaryUrl ? [secondaryUrl] : [])];
        await runSuiteRequest("/api/generations/image-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt.trim(),
            images,
            aspect_ratio: selectedRatio,
          }),
        });
      } else if (activeTool === "remove_bg") {
        await runSuiteRequest("/api/generations/image-remove-background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: primaryUrl,
            content_moderation: false,
          }),
        });
      } else {
        const factor = Number(scaleFactor);
        await runSuiteRequest("/api/generations/image-upscale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: primaryUrl,
            factor,
            ...(primarySourceMime
              ? { source_content_type: primarySourceMime }
              : {}),
          }),
        });
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const triggerClasses =
    "w-full h-11 bg-background/50 border-blue-500/30 text-foreground rounded-xl px-4 hover:border-blue-500/60 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/30";

  const ActiveIcon = SUITE_TOOLS.find((t) => t.id === activeTool)!.icon;

  const submitDisabled =
    !primaryUrl ||
    isGenerating ||
    generationsLoading ||
    (activeTool === "prompt_edit" && !prompt.trim());

  const emptyHint =
    activeTool === "prompt_edit"
      ? "Choose Image 1, add prompt, then run."
      : activeTool === "remove_bg"
        ? "Choose a source image, then remove its background."
        : "Choose a source image and set 2×, 4×, or 8× scale.";

  const handleSourceSelected = (url: string) => {
    if (sourcePickerSlot === "primary") {
      setPrimaryUrl(url);
      setPrimarySourceMime(null);
    } else if (sourcePickerSlot === "secondary") {
      setSecondaryUrl(url);
    }
    setSourcePickerSlot(null);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <AiToolPageHeader
        title="Image Edit"
        description="AI tools for editing images."
        descriptionClassName="max-w-2xl"
        status={generations}
        loading={generationsLoading}
        authenticated={authenticated}
        error={generationsError}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <form onSubmit={handleSubmit} className="lg:col-span-1 space-y-3 lg:space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5 space-y-3">
            <label
              htmlFor="suite-tool"
              className="text-sm font-medium text-foreground block"
            >
              Tool
            </label>
            <Select
              value={activeTool}
              onValueChange={(v) => {
                if (v === "prompt_edit" || v === "remove_bg" || v === "upscale") {
                  setActiveTool(v);
                  setErrorMessage(null);
                }
              }}
            >
              <SelectTrigger id="suite-tool" className={triggerClasses}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUITE_TOOLS.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5 space-y-4">
            <p className="text-sm font-medium text-foreground">Source image</p>
            <p className="text-xs text-muted-foreground">
              {activeTool === "prompt_edit"
                ? "Image 1 required; optional second image for multi-image edits."
                : "One image per run."}{" "}
              <span className="text-foreground/80">PNG, JPEG, or WebP.</span>
            </p>
            <div
              className={cn(
                "grid gap-3",
                activeTool === "prompt_edit" ? "grid-cols-2" : "grid-cols-1",
              )}
            >
              <div className="relative mx-auto w-full max-w-[180px]">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setSourcePickerSlot("primary");
                  }}
                  className="flex aspect-square w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-blue-500/30 bg-background/35 text-left transition-colors hover:border-blue-500/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                >
                  <div className="relative flex min-h-0 flex-1 flex-col">
                    {primaryUrl ? (
                      <img
                        src={replicateFileUrlToDisplaySrc(primaryUrl)}
                        alt="Image 1"
                        className="h-full w-full flex-1 object-cover"
                      />
                    ) : (
                      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 text-muted-foreground/70">
                        <ImageIcon className="h-8 w-8" />
                        <span className="text-xs font-medium text-foreground/90 text-center leading-snug">
                          Image 1
                        </span>
                      </div>
                    )}
                  </div>
                </button>
                {primaryUrl ? (
                  <button
                    type="button"
                    aria-label="Clear Image 1"
                    className="absolute right-1 top-1 z-10 h-7 w-7 cursor-pointer rounded-full border border-blue-500/35 bg-background/80 p-0 text-muted-foreground leading-none backdrop-blur-sm transition-colors hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPrimaryUrl(null);
                      setPrimarySourceMime(null);
                    }}
                  >
                    <X className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2" />
                  </button>
                ) : null}
              </div>
              {activeTool === "prompt_edit" ? (
                <div className="relative mx-auto w-full max-w-[180px]">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      setSourcePickerSlot("secondary");
                    }}
                    className="flex aspect-square w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-blue-500/30 bg-background/35 text-left transition-colors hover:border-blue-500/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                  >
                    <div className="relative flex min-h-0 flex-1 flex-col">
                      {secondaryUrl ? (
                        <img
                          src={replicateFileUrlToDisplaySrc(secondaryUrl)}
                          alt="Image 2"
                          className="h-full w-full flex-1 object-cover"
                        />
                      ) : (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 text-muted-foreground/70">
                          <ImageIcon className="h-8 w-8" />
                          <span className="text-xs font-medium text-foreground/90 text-center leading-snug">
                            Image 2 (optional)
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                  {secondaryUrl ? (
                    <button
                      type="button"
                      aria-label="Clear Image 2"
                      className="absolute right-1 top-1 z-10 h-7 w-7 cursor-pointer rounded-full border border-blue-500/35 bg-background/80 p-0 text-muted-foreground leading-none backdrop-blur-sm transition-colors hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSecondaryUrl(null);
                      }}
                    >
                      <X className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {activeTool === "prompt_edit" ? (
            <>
              <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
                <label
                  htmlFor="edit-prompt"
                  className="text-sm font-medium text-foreground mb-3 block"
                >
                  Edit prompt
                </label>
                <textarea
                  id="edit-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder='e.g. "Change the sky in image 1 to sunset colors"'
                  className="w-full h-32 bg-background/50 border border-blue-500/30 rounded-xl p-4 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-blue-500/60 smooth"
                />
              </div>

              <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
                <label
                  htmlFor="edit-ratio"
                  className="text-sm font-medium text-foreground mb-3 block"
                >
                  Output aspect ratio
                </label>
                <Select value={selectedRatio} onValueChange={setSelectedRatio}>
                  <SelectTrigger id="edit-ratio" className={triggerClasses}>
                    <SelectValue placeholder="Aspect ratio" />
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
            </>
          ) : null}

          {activeTool === "upscale" ? (
            <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
              <label
                htmlFor="scale-factor"
                className="text-sm font-medium text-foreground mb-3 block"
              >
                Scale factor
              </label>
              <Select
                value={scaleFactor}
                onValueChange={(v) => {
                  if (v === "2" || v === "4" || v === "8") setScaleFactor(v);
                }}
              >
                <SelectTrigger id="scale-factor" className={triggerClasses}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2×</SelectItem>
                  <SelectItem value="4">4×</SelectItem>
                  <SelectItem value="8">8×</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={submitDisabled}
            className="w-full h-12 bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl font-medium smooth shadow-lg shadow-blue-500/25 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Working…
              </>
            ) : (
              <>
                <ActiveIcon className="w-5 h-5 mr-2" />
                {activeTool === "prompt_edit"
                  ? "Run edit"
                  : activeTool === "remove_bg"
                    ? "Remove background"
                    : "Upscale"}
              </>
            )}
          </Button>

          {errorMessage && (
            <p className="text-sm text-red-400 text-center">{errorMessage}</p>
          )}
        </form>

        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5 min-h-[350px]">
            <h3 className="text-lg font-medium text-foreground mb-4">Result</h3>
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
                      alt="Result"
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
                      Download
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
                  No output yet
                </h3>
                <p className="text-muted-foreground max-w-sm">{emptyHint}</p>
              </div>
            )}
          </div>

          {user && recentItems.length > 0 ? (
            <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-foreground">
                  Recent (all tools)
                </h3>
                <Link
                  href="/profile/generations?tab=image"
                  className="text-sm text-blue-400 hover:underline"
                >
                  View all
                </Link>
              </div>
              <ul className="space-y-2">
                {recentItems.map((item) => {
                  const displaySrc = replicateFileUrlToDisplaySrc(item.url);
                  const toolLabel =
                    SUITE_TOOLS.find((t) => t.id === item.suiteTool)?.label ??
                    item.suiteTool;
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
                          {toolLabel}
                          {item.suiteTool === "prompt_edit"
                            ? ` · ${item.ratio}${
                                item.sourceImages.length > 1
                                  ? " · turbo"
                                  : ""
                              }`
                            : item.suiteTool === "upscale"
                              ? ` · ${item.upscaleFactor}×`
                              : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => repeatRecent(item)}
                          title="Repeat with same settings"
                          aria-label="Repeat"
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
                          aria-label="Download"
                          className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => void deleteRecent(item.id)}
                          title="Delete"
                          aria-label="Delete"
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

      <BuyExtraGenerationsDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        selectedCount={selectedCount}
        onSelectCount={setSelectedCount}
        onContinue={continuePurchase}
        continueLoading={checkoutLoading}
        continueDisabled={purchaseDisabled}
      />

      <FirstFrameDialog
        open={sourcePickerSlot !== null}
        onOpenChange={(open) => {
          if (!open) setSourcePickerSlot(null);
        }}
        dialogTitle={
          sourcePickerSlot === "secondary"
            ? "Choose Image 2 (optional)"
            : "Choose Image 1"
        }
        generateDescription="Creates an image and uses it as the selected source image."
        onFrameSelected={handleSourceSelected}
        userId={user?.id}
        checkGate={checkGenerationGate}
        onCreatorAiGate={handle403CreatorAiGate}
        syncGenerations={syncGenerations}
        onError={setErrorMessage}
        generationsLoading={generationsLoading}
      />

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
              alt="Result"
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
