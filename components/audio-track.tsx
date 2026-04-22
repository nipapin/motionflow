"use client";

import { Download, Heart } from "lucide-react";
import type { Product } from "@/lib/product-types";
import { productCategoryLabel, productAudioUrl } from "@/lib/product-ui";
import { useFavorites } from "@/components/favorites-provider";
import {
  WaveformPlayer,
  pauseGlobalAudioPlayback,
} from "@/components/waveform-player";
import { cn } from "@/lib/utils";

export { pauseGlobalAudioPlayback };

interface AudioTrackProps {
  product: Product;
  onDownload?: (product: Product) => void;
  onClick?: () => void;
  containerClassName?: string;
}

export function AudioTrack({
  product,
  onDownload,
  onClick,
  containerClassName,
}: AudioTrackProps) {
  const { isFav, toggle: toggleFav } = useFavorites();
  const favorited = isFav(product.id);
  const audioUrl = productAudioUrl(product);

  return (
    <div
      className={
        containerClassName ??
        "group flex items-center gap-4 px-5 py-4 hover:bg-foreground/[0.02] smooth cursor-pointer"
      }
      onClick={onClick}
    >
      <WaveformPlayer
        audioUrl={audioUrl}
        className="flex-1 min-w-0"
        leadingSlot={
          <div className="w-48 shrink-0">
            <h3 className="text-sm font-medium text-foreground line-clamp-1">
              {product.name}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {productCategoryLabel(product)}
            </p>
          </div>
        }
        trailingSlot={
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className={cn(
                "w-9 h-9 flex items-center justify-center rounded-full smooth",
                favorited
                  ? "text-red-400 hover:bg-red-500/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
              )}
              aria-label={
                favorited ? "Remove from favorites" : "Add to favorites"
              }
              onClick={(e) => {
                e.stopPropagation();
                void toggleFav(product.id);
              }}
            >
              <Heart className={cn("w-4 h-4", favorited && "fill-current")} />
            </button>
            <button
              type="button"
              className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full smooth"
              aria-label="Download"
              onClick={(e) => {
                e.stopPropagation();
                onDownload?.(product);
              }}
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        }
      />
    </div>
  );
}
