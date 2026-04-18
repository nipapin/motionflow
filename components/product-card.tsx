"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Heart, Download, Volume2, VolumeOff } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useVideoMute } from "@/components/video-mute-provider";
import { useFavorites } from "@/components/favorites-provider";
import type { Product } from "@/lib/product-types";
import {
  productCardVideoSrc,
  productCategoryLabel,
  productKind,
  productSoftwareLabel,
  productThumbnailUrl,
} from "@/lib/product-ui";

export type { Product, ProductFiles } from "@/lib/product-types";

interface ProductCardProps {
  product: Product;
  onDownload?: (product: Product) => void;
  onClick?: () => void;
}

const previewVideos: Record<string, string> = {
  "After Effects": "https://assets.mixkit.co/videos/preview/mixkit-abstract-technology-network-connections-27871-large.mp4",
  "Premiere Pro": "https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-futuristic-devices-99786-large.mp4",
  "DaVinci Resolve": "https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-a-city-11739-large.mp4",
  default: "https://assets.mixkit.co/videos/preview/mixkit-abstract-technology-network-connections-27871-large.mp4",
};

/** Hover preview: `ProductFiles.video` (resolved), else MP4 `demo_url`, else stock clip by software. */
function templatePreviewVideoUrl(product: Product): string {
  const fromFiles = productCardVideoSrc(product);
  if (fromFiles) return fromFiles;
  const label = productSoftwareLabel(product);
  return previewVideos[label] ?? previewVideos.default;
}

export function ProductCard({ product, onDownload, onClick }: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  /** Set on first hover; kept after leave so the clip stays buffered (no reload / spinner on re-hover). */
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoUiLoading, setVideoUiLoading] = useState(false);
  const { muted: globalMuted, toggle: toggleGlobalMute } = useVideoMute();
  const { isFav, toggle: toggleFav } = useFavorites();
  const favorited = isFav(product.id);
  const wantsVideoRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const kind = productKind(product);
  const thumbnail = productThumbnailUrl(product);
  const softwareLabel = productSoftwareLabel(product);
  const categoryLabel = productCategoryLabel(product);

  const previewUrl = kind === "template" ? templatePreviewVideoUrl(product) : "";

  const handleMouseEnter = () => {
    wantsVideoRef.current = true;
    setIsHovered(true);
    if (previewUrl) setVideoSrc(previewUrl);

    // After first load, `src` is kept — play as soon as the frame has committed (no loading UI).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = videoRef.current;
        if (!el || !wantsVideoRef.current) return;
        if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          setVideoUiLoading(false);
          el.currentTime = 0;
          el.play().catch(() => {});
        }
      });
    });
  };

  const handleMouseLeave = () => {
    wantsVideoRef.current = false;
    setIsHovered(false);
    const el = videoRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
  };

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = globalMuted;
    el.volume = 0.5;
  }, [globalMuted]);

  useEffect(() => {
    if (!videoSrc) {
      setVideoUiLoading(false);
      return;
    }

    const el = videoRef.current;
    if (!el) return;

    setVideoUiLoading(true);

    const tryPlay = () => {
      if (!wantsVideoRef.current) return;
      el.currentTime = 0;
      el.play().catch(() => {});
    };

    const finishLoadingUi = () => {
      setVideoUiLoading(false);
      tryPlay();
    };

    const onError = () => {
      setVideoUiLoading(false);
    };

    el.addEventListener("canplay", finishLoadingUi, { once: true });
    el.addEventListener("loadeddata", finishLoadingUi, { once: true });
    el.addEventListener("error", onError, { once: true });

    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      finishLoadingUi();
    }

    return () => {
      el.removeEventListener("canplay", finishLoadingUi);
      el.removeEventListener("loadeddata", finishLoadingUi);
      el.removeEventListener("error", onError);
    };
  }, [videoSrc]);

  return (
    <div
      className="group relative rounded-2xl overflow-hidden cursor-pointer bg-card border border-blue-500/30 hover:border-2 hover:border-blue-500 smooth hover-lift glow visibility-auto"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      <div className="relative aspect-video bg-muted overflow-hidden">
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className={cn(
              "object-cover transition-opacity duration-500",
              isHovered && kind === "template" ? "opacity-0" : "opacity-100"
            )}
            unoptimized
          />
        ) : null}

        {kind === "template" && previewUrl ? (
          <video
            ref={videoRef}
            src={videoSrc ?? undefined}
            preload="metadata"
            muted
            loop
            playsInline
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-opacity duration-500",
              isHovered ? "opacity-100" : "opacity-0"
            )}
          />
        ) : null}

        {kind === "template" && isHovered && videoSrc && videoUiLoading ? (
          <div className="absolute inset-0 z-15 flex items-center justify-center bg-black/25 pointer-events-none">
            <Spinner className="size-7 text-blue-400" aria-label="Loading preview" />
          </div>
        ) : null}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-4 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-2 group-hover:translate-y-0">
          <span className="text-[11px] px-3 py-1.5 rounded-full font-medium backdrop-blur-md bg-blue-500/90 text-white">
            {softwareLabel}
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleGlobalMute();
            }}
            className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 smooth border border-white/10"
            aria-label={globalMuted ? "Unmute" : "Mute"}
          >
            {globalMuted ? <VolumeOff className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-2 group-hover:translate-y-0">
          <div className="flex-1 min-w-0 mr-3">
            <h3 className="font-semibold text-white text-sm line-clamp-1 mb-0.5">{product.name}</h3>
            <p className="text-white/50 text-xs">{categoryLabel}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void toggleFav(product.id); }}
              className={cn(
                "w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center smooth border border-white/10",
                favorited ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white hover:bg-white/20",
              )}
              aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
            >
              <Heart className={cn("w-4 h-4", favorited && "fill-current")} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDownload?.(product);
              }}
              className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 smooth shrink-0"
              aria-label="Download"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
