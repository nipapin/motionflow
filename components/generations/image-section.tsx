"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Download, Trash2 } from "lucide-react";
import type { ImageHistory } from "@/lib/generations-types";
import { IMAGE_STYLE_PRESETS } from "@/lib/generations-utils";
import { CircularLoader } from "@/components/ui/circular-loader";
import { downloadUrlAsFile } from "@/lib/download-url-as-file";
import { replicateFileUrlToDisplaySrc } from "@/lib/replicate-file-display-url";

interface Props {
  items: ImageHistory[];
  onPreview: (url: string) => void;
  onRemove: (id: string) => void;
}

export function ImageSection({ items, onPreview, onRemove }: Props) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm sm:p-5">
      {items.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            No image generations yet.{" "}
            <Link
              href="/image-generation"
              className="font-medium text-foreground underline underline-offset-4 hover:opacity-90"
            >
              Open image generator
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <ImageCard
              key={item.id}
              item={item}
              onPreview={onPreview}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  item: ImageHistory;
  onPreview: (url: string) => void;
  onRemove: (id: string) => void;
}

function ImageCard({ item, onPreview, onRemove }: CardProps) {
  const [downloading, setDownloading] = useState(false);
  const firstImage = item.images[0];
  const displaySrc = firstImage
    ? replicateFileUrlToDisplaySrc(firstImage)
    : null;

  const onDownload = useCallback(async () => {
    if (!displaySrc || downloading) return;
    await downloadUrlAsFile(
      displaySrc,
      `motionflow-image-${item.id.slice(0, 8)}`,
      { onLoadingChange: setDownloading },
    );
  }, [displaySrc, downloading, item.id]);

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border/50 bg-muted/15 p-3 transition-colors hover:bg-muted/25">
      {displaySrc ? (
        <button
          type="button"
          className="w-16 h-16 rounded-lg overflow-hidden shrink-0 cursor-pointer hover:opacity-80 smooth border-0 p-0 bg-transparent"
          onClick={() => onPreview(displaySrc)}
        >
          <img
            src={displaySrc}
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
              {IMAGE_STYLE_PRESETS.find((s) => s.id === item.style)?.label} |{" "}
              {item.ratio}
            </>
          )}{" "}
          | {item.timestamp.toLocaleString()}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {displaySrc ? (
          <button
            type="button"
            onClick={() => void onDownload()}
            disabled={downloading}
            title="Download"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {downloading ? (
              <CircularLoader className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
