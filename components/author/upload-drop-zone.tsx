"use client";

import { useCallback, useId, useState } from "react";
import { FileImage, Film, FolderArchive, Loader2 } from "lucide-react";
import type { ProductFiles } from "@/lib/product-types";
import { uploadItemFileToR2, type UploadItemAttributes, type UploadSlot } from "@/components/author/upload-item-file";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const VIDEO_MAX_BYTES = 350 * 1024 * 1024;
const ZIP_MAX_BYTES = 3 * 1024 * 1024 * 1024;

const IMG_MIN_W = 1280;
const IMG_MIN_H = 720;
const IMG_MAX_W = 3840;
const IMG_MAX_H = 2160;

function readImageDimensions(file: File): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  return new Promise((resolve, reject) => {
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions"));
    };
    img.src = url;
  });
}

async function validateFile(
  slot: UploadSlot,
  file: File,
): Promise<string | null> {
  if (slot === "image") {
    if (!file.type.startsWith("image/")) {
      return "Choose a raster image (JPG, PNG, WebP, GIF).";
    }
    if (file.size > IMAGE_MAX_BYTES) {
      return `Image must be at most ${(IMAGE_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB.`;
    }
    try {
      const { w, h } = await readImageDimensions(file);
      if (w < IMG_MIN_W || h < IMG_MIN_H || w > IMG_MAX_W || h > IMG_MAX_H) {
        return `Image size must be between ${IMG_MIN_W}×${IMG_MIN_H} and ${IMG_MAX_W}×${IMG_MAX_H} px (got ${w}×${h}).`;
      }
    } catch {
      return "Could not validate image dimensions.";
    }
    return null;
  }
  if (slot === "video") {
    if (!file.type.startsWith("video/") && !file.name.toLowerCase().endsWith(".mov")) {
      return "Choose a video file (MP4, WebM, MOV).";
    }
    if (file.size > VIDEO_MAX_BYTES) {
      return `Video must be at most ${(VIDEO_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB.`;
    }
    return null;
  }
  if (slot === "main") {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".zip") && file.type !== "application/zip" && file.type !== "application/x-zip-compressed") {
      return "Choose a .ZIP archive.";
    }
    if (file.size > ZIP_MAX_BYTES) {
      return `Archive must be at most ${(ZIP_MAX_BYTES / (1024 * 1024 * 1024)).toFixed(0)} GB.`;
    }
    return null;
  }
  return null;
}

const SLOT_META: Record<
  UploadSlot,
  { title: string; hint: string; accept: string; Icon: typeof FileImage }
> = {
  image: {
    title: "Preview image",
    hint: `.JPG / PNG / WebP — max ${(IMAGE_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB — ${IMG_MIN_W}×${IMG_MIN_H} … ${IMG_MAX_W}×${IMG_MAX_H} px`,
    accept: "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif",
    Icon: FileImage,
  },
  video: {
    title: "Preview video",
    hint: `.MP4 / WebM / MOV — max ${(VIDEO_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB`,
    accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov",
    Icon: Film,
  },
  main: {
    title: "Project file",
    hint: `.ZIP — max ${(ZIP_MAX_BYTES / (1024 * 1024 * 1024)).toFixed(0)} GB (use stronger compression if larger)`,
    accept: "application/zip,application/x-zip-compressed,.zip",
    Icon: FolderArchive,
  },
};

export function UploadDropZone({
  slot,
  itemId,
  disabled,
  current,
  onUploaded,
}: {
  slot: UploadSlot;
  itemId: number | null;
  disabled: boolean;
  current: string | undefined;
  onUploaded: (payload: { files: ProductFiles; attributes?: UploadItemAttributes }) => void;
}) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const meta = SLOT_META[slot];
  const { Icon } = meta;

  const runUpload = useCallback(
    async (file: File | undefined) => {
      if (!file || busy || disabled || !itemId) return;
      const err = await validateFile(slot, file);
      if (err) {
        toast.error(err);
        return;
      }
      setBusy(true);
      try {
        const result = await uploadItemFileToR2(itemId, slot, file);
        onUploaded(result);
        toast.success(`${meta.title} uploaded`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, disabled, itemId, meta.title, onUploaded, slot],
  );

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "relative flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
          disabled && "pointer-events-none opacity-50",
          drag && !disabled && "border-primary bg-primary/5",
          !drag && "border-muted-foreground/35 bg-muted/20",
          current && "border-emerald-500/50 bg-emerald-500/5",
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled && itemId) setDrag(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && itemId) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          void runUpload(f);
        }}
      >
        {busy ? (
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        ) : (
          <Icon className="h-10 w-10 text-muted-foreground" />
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{meta.title}</p>
          <label htmlFor={inputId} className="cursor-pointer text-sm text-primary underline-offset-4 hover:underline">
            Drag &amp; drop or click to browse
          </label>
          <p className="mx-auto max-w-[280px] text-xs leading-snug text-muted-foreground">{meta.hint}</p>
        </div>
        {current ? (
          <p className="mt-1 max-w-full truncate font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
            {current}
          </p>
        ) : null}
        <input
          id={inputId}
          type="file"
          className="sr-only"
          accept={meta.accept}
          disabled={busy || disabled || !itemId}
          onChange={(ev) => {
            const f = ev.target.files?.[0];
            void runUpload(f);
            ev.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
