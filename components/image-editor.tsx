"use client";

import Link from "next/link";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
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
  Upload,
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
import { useGenerations, type GenerationStatus } from "@/hooks/use-generations";
import { GenerationsBadge } from "@/components/generations-badge";
import {
  CREATOR_AI_REQUIRED_CODE,
  getAiGenerateBlockReason,
} from "@/lib/ai-generation-gate";
import { replicateFileUrlToDisplaySrc } from "@/lib/replicate-file-display-url";
import { cn } from "@/lib/utils";

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

/** Image Edit uploads: PNG, JPEG, WebP only (no GIF). */
const IMAGE_SUITE_ACCEPT =
  "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
const ALLOWED_SUITE_UPLOAD_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

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
  const [uploadingSlot, setUploadingSlot] = useState<"primary" | "secondary" | null>(
    null,
  );
  const [dragOverSlot, setDragOverSlot] = useState<"primary" | "secondary" | null>(
    null,
  );
  const primaryInputRef = useRef<HTMLInputElement>(null);
  const secondaryInputRef = useRef<HTMLInputElement>(null);

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
    setDragOverSlot(null);
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

  const remaining = generations?.remaining ?? 0;
  const atLimitForCreatorAi =
    user &&
    generations?.plan === "creator_ai" &&
    !generationsLoading &&
    remaining <= 0;

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
        "You've reached your generation limit. Upgrade or wait for the next billing period.",
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

  const uploadFile = async (
    file: File,
    slot: "primary" | "secondary",
  ): Promise<void> => {
    setErrorMessage(null);
    const mime = file.type || "application/octet-stream";
    if (!ALLOWED_SUITE_UPLOAD_MIMES.has(mime)) {
      setErrorMessage("Please use PNG, JPEG, or WebP only.");
      return;
    }
    if (!checkGenerationGate()) return;

    setUploadingSlot(slot);
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
        content_type?: string;
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
      if (!data.url) throw new Error("No URL returned");
      if (slot === "primary") {
        setPrimaryUrl(data.url);
        const ct = data.content_type ?? mime;
        setPrimarySourceMime(
          ALLOWED_SUITE_UPLOAD_MIMES.has(ct) ? ct : mime,
        );
      } else {
        setSecondaryUrl(data.url);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to upload image",
      );
    } finally {
      setUploadingSlot(null);
    }
  };

  const onPrimaryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void uploadFile(file, "primary");
  };

  const onSecondaryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void uploadFile(file, "secondary");
  };

  const openFilePicker = (slot: "primary" | "secondary") => {
    if (uploadBusy) return;
    if (slot === "primary") primaryInputRef.current?.click();
    else secondaryInputRef.current?.click();
  };

  const handleZoneDrop = (
    slot: "primary" | "secondary",
    e: React.DragEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSlot(null);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file, slot);
  };

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
    };

    if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
      handle403CreatorAiGate(data.plan);
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

  const uploadBusy = uploadingSlot !== null;
  const ActiveIcon = SUITE_TOOLS.find((t) => t.id === activeTool)!.icon;

  const submitDisabled =
    !primaryUrl ||
    isGenerating ||
    generationsLoading ||
    uploadBusy ||
    (activeTool === "prompt_edit" && !prompt.trim());

  const emptyHint =
    activeTool === "prompt_edit"
      ? "Upload image 1, describe the change, then run."
      : activeTool === "remove_bg"
        ? "Upload an image, then remove its background."
        : "Upload a PNG, JPEG, or WebP image and choose 2×, 4×, or 8× scale.";

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-foreground mb-2 tracking-tight">
            AI Image Edit
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Choose a tool below.{" "}
            <span className="text-foreground/90">
              Each successful run uses{" "}
              <span className="font-medium text-foreground">1 generation</span>{" "}
              from your quota.
            </span>
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
        <form onSubmit={handleSubmit} className="lg:col-span-1 space-y-6">
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
            <input
              ref={primaryInputRef}
              type="file"
              accept={IMAGE_SUITE_ACCEPT}
              className="hidden"
              onChange={onPrimaryFile}
            />
            <input
              ref={secondaryInputRef}
              type="file"
              accept={IMAGE_SUITE_ACCEPT}
              className="hidden"
              onChange={onSecondaryFile}
            />
            <div
              className={cn(
                "grid gap-3",
                activeTool === "prompt_edit"
                  ? "grid-cols-1 sm:grid-cols-2"
                  : "grid-cols-1",
              )}
            >
              {/* Image 1 */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Image 1 drop zone"
                onClick={() => openFilePicker("primary")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openFilePicker("primary");
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOverSlot("primary");
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverSlot((prev) => (prev === "primary" ? null : prev));
                  }
                }}
                onDrop={(e) => handleZoneDrop("primary", e)}
                className={cn(
                  "relative flex min-h-[148px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50",
                  dragOverSlot === "primary"
                    ? "border-blue-400 bg-blue-500/15"
                    : "border-blue-500/40 bg-background/40 hover:border-blue-500/60 hover:bg-background/55",
                  uploadBusy ? "pointer-events-none opacity-70" : "cursor-pointer",
                )}
              >
                {primaryUrl ? (
                  <>
                    <img
                      src={replicateFileUrlToDisplaySrc(primaryUrl)}
                      alt=""
                      className="max-h-32 w-full max-w-full rounded-lg object-contain"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="absolute right-2 top-2 h-8 border border-blue-500/40 bg-background/90 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrimaryUrl(null);
                        setPrimarySourceMime(null);
                      }}
                    >
                      Clear
                    </Button>
                  </>
                ) : uploadingSlot === "primary" ? (
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-400" />
                ) : (
                  <>
                    <Upload className="mb-2 h-8 w-8 text-blue-400/90" />
                    <span className="text-sm font-medium text-foreground">
                      {activeTool === "prompt_edit"
                        ? "Image 1"
                        : "Drop image here"}
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      Drop or click
                    </span>
                  </>
                )}
              </div>

              {/* Image 2 — only prompt edit */}
              {activeTool === "prompt_edit" ? (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Image 2 drop zone"
                  onClick={() => openFilePicker("secondary")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openFilePicker("secondary");
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOverSlot("secondary");
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverSlot((prev) =>
                        prev === "secondary" ? null : prev,
                      );
                    }
                  }}
                  onDrop={(e) => handleZoneDrop("secondary", e)}
                  className={cn(
                    "relative flex min-h-[148px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50",
                    dragOverSlot === "secondary"
                      ? "border-blue-400 bg-blue-500/15"
                      : "border-blue-500/30 bg-background/30 hover:border-blue-500/50 hover:bg-background/45",
                    uploadBusy ? "pointer-events-none opacity-70" : "cursor-pointer",
                  )}
                >
                  {secondaryUrl ? (
                    <>
                      <img
                        src={replicateFileUrlToDisplaySrc(secondaryUrl)}
                        alt=""
                        className="max-h-32 w-full max-w-full rounded-lg object-contain"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="absolute right-2 top-2 h-8 border border-blue-500/40 bg-background/90 px-2 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSecondaryUrl(null);
                        }}
                      >
                        Clear
                      </Button>
                    </>
                  ) : uploadingSlot === "secondary" ? (
                    <RefreshCw className="h-8 w-8 animate-spin text-blue-400" />
                  ) : (
                    <>
                      <Upload className="mb-2 h-8 w-8 text-blue-400/70" />
                      <span className="text-sm font-medium text-foreground">
                        Image 2
                      </span>
                      <span className="mt-1 text-xs text-muted-foreground">
                        Drop or click (optional)
                      </span>
                    </>
                  )}
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
