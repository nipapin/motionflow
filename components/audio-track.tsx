"use client";

import { useState, useMemo } from "react";
import { Play, Pause, Download, Bookmark } from "lucide-react";
import type { Product } from "@/lib/product-types";
import { productCategoryLabel } from "@/lib/product-ui";

interface AudioTrackProps {
  product: Product;
}

export function AudioTrack({ product }: AudioTrackProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const bars = useMemo(
    () => Array.from({ length: 80 }, () => Math.random()),
    []
  );

  return (
    <div className="group flex items-center gap-4 px-5 py-4 hover:bg-foreground/[0.02] smooth">
      {/* Play button */}
      <button
        type="button"
        onClick={() => setIsPlaying(!isPlaying)}
        className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center text-foreground hover:bg-foreground hover:text-background smooth shrink-0"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>

      {/* Title & category */}
      <div className="w-48 shrink-0">
        <h3 className="text-sm font-medium text-foreground line-clamp-1">{product.name}</h3>
        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{productCategoryLabel(product)}</p>
      </div>

      {/* Waveform */}
      <div className="flex-1 flex items-center h-10 gap-[2px] min-w-0">
        {bars.map((height, i) => (
          <div
            key={`bar-${product.id}-${i}`}
            className="flex-1 min-w-[2px] max-w-[4px] bg-foreground/10 group-hover:bg-foreground/20 rounded-full smooth"
            style={{ height: `${Math.max(height * 100, 12)}%` }}
          />
        ))}
      </div>

      {/* Duration */}

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full smooth"
          aria-label="Save to favorites"
        >
          <Bookmark className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full smooth"
          aria-label="Download"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
