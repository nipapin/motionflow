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
  /** Hide the title/category row when the parent already shows the product name (e.g. detail modal). */
  hideTitleRow?: boolean;
  /** Hide the trailing download icon (e.g. when the parent provides a primary Download action). */
  hideDownloadButton?: boolean;
}

export function AudioTrack({
  product,
  onDownload,
  onClick,
  containerClassName,
  hideTitleRow = false,
  hideDownloadButton = false,
}: AudioTrackProps) {
  const { isFav, toggle: toggleFav } = useFavorites();
  const favorited = isFav(product.id);
  const audioUrl = productAudioUrl(product);

  return (
    <div
      className={
        containerClassName ??
        "group flex items-center gap-3 px-3 py-4 sm:gap-4 sm:px-5 hover:bg-foreground/2 smooth cursor-pointer"
      }
      onClick={onClick}
    >
      <WaveformPlayer
        audioUrl={audioUrl}
        className="flex-1 min-w-0 gap-2 sm:gap-4"
        buttonClassName="w-9 h-9 sm:w-10 sm:h-10"
        waveformClassName="h-8 sm:h-10"
        timeClassName="hidden sm:inline"
        hideWaveformOnMobile
        trackMeta={{ title: product.name, subtitle: productCategoryLabel(product) }}
        leadingSlot={
          hideTitleRow ? undefined : (
            <div className="w-32 shrink-0 sm:w-48">
              <h3 className="text-sm font-medium text-foreground line-clamp-1">
                {product.name}
              </h3>
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {productCategoryLabel(product)}
              </p>
            </div>
          )
        }
        trailingSlot={
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <button
              type="button"
              className={cn(
                "w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full smooth",
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
            {!hideDownloadButton && (
              <button
                type="button"
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full smooth"
                aria-label="Download"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload?.(product);
                }}
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        }
      />
    </div>
  );
}
