"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CREATOR_AI_REQUIRED_CODE } from "@/lib/ai-generation-gate";
import type { GenerationStatus } from "@/hooks/use-generations";
import { triggerClasses } from "@/components/video-generator/styles";

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

const ffDialogTabTriggerClass =
  "text-xs sm:text-sm text-muted-foreground data-[state=active]:border-transparent data-[state=active]:bg-linear-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30 data-[state=active]:dark:from-blue-600 data-[state=active]:dark:to-blue-500";

type ApiGenerationRecord = {
  id: string;
  status: string;
  result: Record<string, unknown> | null;
};

interface FirstFrameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the chosen frame URL when the user picks an image. */
  onFrameSelected: (url: string) => void;
  /** User id — used to gate the library load. Null when signed out. */
  userId: string | number | undefined | null;
  /** Returns true if the caller is clear to proceed; false if a gate was triggered. */
  checkGate: () => boolean;
  /** Call when a 403 with CREATOR_AI_REQUIRED_CODE is received. */
  onCreatorAiGate: (plan?: string) => void;
  /** Call to sync generation status after a successful/failed API response. */
  syncGenerations: (genStatus?: GenerationStatus) => void;
  /** Call to surface an error message to the parent. */
  onError: (message: string | null) => void;
  generationsLoading: boolean;
}

export function FirstFrameDialog({
  open,
  onOpenChange,
  onFrameSelected,
  userId,
  checkGate,
  onCreatorAiGate,
  syncGenerations,
  onError,
  generationsLoading,
}: FirstFrameDialogProps) {
  const [ffUploading, setFfUploading] = useState(false);
  const [ffGenLoading, setFfGenLoading] = useState(false);
  const [libraryItems, setLibraryItems] = useState<{ id: string; url: string }[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [ffPrompt, setFfPrompt] = useState("");
  const [ffStyle, setFfStyle] = useState("realistic");
  const [ffRatio, setFfRatio] = useState("1:1");

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLibraryLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          "/api/me/generation-records?tool=image&limit=100",
          { credentials: "include", cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { items?: ApiGenerationRecord[] };
        const flat: { id: string; url: string }[] = [];
        for (const row of data.items ?? []) {
          if (row.status !== "ok" || !row.result) continue;
          const imgs = row.result.images;
          if (!Array.isArray(imgs)) continue;
          imgs.forEach((u, i) => {
            if (typeof u === "string") flat.push({ id: `${row.id}-${i}`, url: u });
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
  }, [open, userId]);

  const handleFfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    onError(null);
    if (!checkGate()) return;

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
        onCreatorAiGate(data.plan);
        return;
      }
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
      if (!data.url) throw new Error("No URL returned");
      onFrameSelected(data.url);
      onOpenChange(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setFfUploading(false);
    }
  };

  const handleFfGenerate = async () => {
    if (!ffPrompt.trim() || ffGenLoading || generationsLoading) return;
    if (!checkGate()) return;

    setFfGenLoading(true);
    onError(null);
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
        onCreatorAiGate(data.plan);
        return;
      }
      if (!res.ok) {
        syncGenerations(data.generations);
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const url = data.images?.[0];
      if (!url) throw new Error("No image returned");
      syncGenerations(data.generations);
      onFrameSelected(url);
      onOpenChange(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to generate image");
    } finally {
      setFfGenLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              Creates a still using one image generation, then uses it as the first frame.
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
              disabled={!ffPrompt.trim() || ffGenLoading || generationsLoading}
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
                  Generate image &amp; use
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="library" className="pt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Images from your past image generations.
            </p>
            {libraryLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
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
                      onFrameSelected(item.url);
                      onOpenChange(false);
                    }}
                  >
                    <img src={item.url} alt="" className="w-full h-full object-cover" />
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
                onChange={(e) => void handleFfFileChange(e)}
              />
            </label>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
