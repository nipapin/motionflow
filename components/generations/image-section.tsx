"use client";

import Link from "next/link";
import { Download, Trash2 } from "lucide-react";
import type { ImageHistory } from "@/lib/generations-types";
import { IMAGE_STYLE_PRESETS } from "@/lib/generations-utils";
import { replicateFileUrlToDisplaySrc } from "@/lib/replicate-file-display-url";

interface Props {
  items: ImageHistory[];
  onPreview: (url: string) => void;
  onRemove: (id: string) => void;
}

export function ImageSection({ items, onPreview, onRemove }: Props) {
  return (
    <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No image generations yet.{" "}
          <Link href="/image-generation" className="text-blue-400 hover:underline">
            Create one
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
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
  const firstImage = item.images[0];
  const displaySrc = firstImage
    ? replicateFileUrlToDisplaySrc(firstImage)
    : null;

  return (
    <div className="flex items-center gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth">
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
          <a
            href={displaySrc}
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
          onClick={() => onRemove(item.id)}
          className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
