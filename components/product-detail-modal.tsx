"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";

import { X, Heart, Play, Download, Monitor, FolderOpen, CalendarDays, FileAudio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { useFavorites } from "@/components/favorites-provider";
import { SignInModal } from "@/components/sign-in-modal";
import { SubscriptionModal } from "@/components/subscription-modal";
import { DownloadStartedModal } from "@/components/download-started-modal";
import type { Product } from "@/lib/product-types";
import {
  productCardVideoSrc,
  productKind,
  productPreviewVideoUrl,
  productSoftwareLabel,
  productThumbnailUrl,
} from "@/lib/product-ui";
import { AudioTrack, pauseGlobalAudioPlayback } from "./audio-track";
import { SimilarProducts } from "./similar-products";
import { openMarketplaceDownload } from "@/lib/open-marketplace-download";

interface ProductDetailModalProps {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  similarProducts?: Product[];
  onProductChange?: (product: Product) => void;
}

export function ProductDetailModal({ product, open, onOpenChange, similarProducts = [], onProductChange }: ProductDetailModalProps) {
  const { user } = useAuth();
  const { isFav, toggle: toggleFav } = useFavorites();
  const favorited = isFav(product.id);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [downloadStartedOpen, setDownloadStartedOpen] = useState(false);
  const [downloadItemId, setDownloadItemId] = useState<number | null>(null);
  const [canDownload, setCanDownload] = useState<boolean | null>(null);

  const kind = productKind(product);
  const heroThumb = productThumbnailUrl(product);
  const mp4Url = kind === "template" ? productCardVideoSrc(product) : undefined;
  const youtubeUrl = productPreviewVideoUrl(product);
  const hasVideo = !!(mp4Url || youtubeUrl);

  useEffect(() => {
    if (open && mp4Url) {
      setVideoSrc(mp4Url);
      setIsPlaying(true);
    }
    if (!open) {
      setIsPlaying(false);
      setVideoSrc(null);
    }
  }, [open, mp4Url]);

  useEffect(() => {
    if (open) pauseGlobalAudioPlayback();
  }, [open, product.id]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo(0, 0);
  }, [open, product.id]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const slug = product.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const cleanPath = window.location.pathname;
    window.history.replaceState(null, "", `${cleanPath}?product=${product.id}-${slug}`);

    return () => {
      window.history.replaceState(null, "", cleanPath);
    };
  }, [open, product.id, product.name]);

  useEffect(() => {
    if (!open || !user) {
      setCanDownload(null);
      return;
    }
    let cancelled = false;
    setCanDownload(null);
    fetch(`/api/me/can-download?itemId=${product.id}`)
      .then((r) => r.json())
      .then((data: { canDownload?: boolean }) => {
        if (!cancelled) setCanDownload(!!data.canDownload);
      })
      .catch(() => {
        if (!cancelled) setCanDownload(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user, product.id]);

  if (!open) return null;

  const tagParts = product.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const tags = tagParts;

  const softwareLabel = productSoftwareLabel(product);
  const attrs = product.attributes ?? {};

  const publishedDate = (() => {
    const d = new Date(product.created_at);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  })();

  const isAudio = kind === "stock-audio" || kind === "sound-fx";

  const details: { icon: React.ReactNode; label: string; value: string }[] = [];

  if (isAudio) {
    details.push({ icon: <FileAudio className="w-4 h-4" />, label: "Included Files", value: "MP3" });
  } else {
    if (attrs.ae_version || softwareLabel) {
      details.push({
        icon: <span className="text-[10px] font-bold leading-none">{softwareLabel === "Premiere Pro" ? "Pr" : softwareLabel === "DaVinci Resolve" ? "Dr" : softwareLabel === "Illustrator" ? "Ai" : "Ae"}</span>,
        label: `${softwareLabel} version`,
        value: attrs.ae_version || "—",
      });
    }
    if (attrs.resolution) {
      details.push({ icon: <Monitor className="w-4 h-4" />, label: "Resolution", value: attrs.resolution });
    }
  }
  if (attrs.file_size) {
    details.push({ icon: <FolderOpen className="w-4 h-4" />, label: "File Size", value: attrs.file_size });
  }
  details.push({ icon: <CalendarDays className="w-4 h-4" />, label: "Published", value: publishedDate });

  const handlePlay = () => {
    if (youtubeUrl && !mp4Url) {
      setIsPlaying(true);
      return;
    }
    if (!mp4Url) return;

    if (isPlaying) {
      videoRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (!videoSrc) setVideoSrc(mp4Url);
      setIsPlaying(true);
      requestAnimationFrame(() => {
        const el = videoRef.current;
        if (!el) return;
        if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          el.play().catch(() => {});
        }
      });
    }
  };

  const handleVideoCanPlay = () => {
    if (isPlaying) {
      videoRef.current?.play().catch(() => {});
    }
  };

  const handleAction = () => {
    if (!user) {
      setSignInOpen(true);
      return;
    }
    if (canDownload) {
      openMarketplaceDownload(product.id);
      setDownloadItemId(product.id);
      setDownloadStartedOpen(true);
      return;
    }
    setSubscriptionOpen(true);
  };

  return (
    <>
      <div
        ref={scrollRef}
        className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm overflow-y-auto"
        onClick={() => onOpenChange(false)}
      >
        <div className="dark w-[70vw] max-w-[70vw] mx-auto my-8 px-4 flex flex-col min-h-[calc(100vh-4rem)]">
          {/* Header */}
          <div className="flex items-center justify-end gap-2 mb-6 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); void toggleFav(product.id); }}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center smooth",
                favorited ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white hover:bg-white/20",
              )}
            >
              <Heart className={cn("w-5 h-5", favorited && "fill-current")} />
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 smooth"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1" onClick={(e) => e.stopPropagation()}>
            <div className="w-full">
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Video / Preview */}
                {kind === "template" && (
                  <div className="flex-1">
                    <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-blue-500/20">
                      {/* Category Badge */}
                      <div className="absolute top-4 right-4 z-10">
                        <span className="text-xs px-3 py-1.5 rounded-full font-medium backdrop-blur-md bg-blue-500/90 text-white">
                          {productSoftwareLabel(product)}
                        </span>
                      </div>

                      {/* Poster image */}
                      {heroThumb ? (
                        <Image
                          src={heroThumb}
                          alt={product.name}
                          fill
                          sizes="(max-width: 1024px) 100vw, 66vw"
                          className={cn("object-cover transition-opacity duration-500", isPlaying ? "opacity-0" : "opacity-100")}
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full bg-muted" aria-hidden />
                      )}

                      {/* MP4 video */}
                      {mp4Url && (
                        <video
                          ref={videoRef}
                          src={videoSrc ?? undefined}
                          muted
                          loop
                          playsInline
                          onCanPlay={handleVideoCanPlay}
                          controls
                          controlsList="nodownload"
                          className={cn(
                            "absolute inset-0 w-full h-full object-cover transition-opacity duration-500",
                            isPlaying ? "opacity-100" : "opacity-0",
                          )}
                        />
                      )}

                      {/* YouTube iframe */}
                      {!mp4Url && youtubeUrl && isPlaying && (
                        <iframe
                          src={youtubeUrl}
                          title={product.name}
                          allow="autoplay; encrypted-media"
                          allowFullScreen
                          className="absolute inset-0 w-full h-full"
                        />
                      )}

                      {/* Play / Pause button — only for YouTube (mp4 uses native controls) */}
                      {!mp4Url && youtubeUrl && !isPlaying && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <button
                            onClick={handlePlay}
                            className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 smooth"
                          >
                            <Play className="w-8 h-8 text-white ml-1" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {isAudio && (
                  <div className="flex-1 w-full flex items-center justify-center">
                    <AudioTrack
                      key={product.id}
                      product={product}
                      containerClassName="bg-card/50 w-full backdrop-blur-xl rounded-2xl border border-blue-500/20 flex items-center gap-4 px-5 py-4"
                    />
                  </div>
                )}

                {/* Info Sidebar */}
                <div className="w-full lg:w-96 shrink-0">
                  <div className="bg-card/50 backdrop-blur-xl rounded-2xl border border-blue-500/20 p-6">
                    <h1 className="text-xl font-semibold text-foreground leading-tight">{product.name}</h1>

                    {/* Description */}
                    {product.description_html ? (
                      <div
                        className="mt-3 text-sm text-muted-foreground line-clamp-4 leading-relaxed prose-sm prose-invert"
                        dangerouslySetInnerHTML={{
                          __html: product.description_html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ""),
                        }}
                      />
                    ) : product.description ? (
                      <p className="mt-3 text-sm text-muted-foreground line-clamp-4 leading-relaxed">{product.description}</p>
                    ) : null}

                    <Button
                      onClick={handleAction}
                      disabled={!!user && canDownload === null}
                      className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-medium mt-6 mb-6 shadow-lg shadow-blue-500/25 disabled:opacity-60"
                    >
                      <Download className="w-5 h-5 mr-2" />
                      {!user ? "Sign in to Download" : canDownload === null ? "Checking…" : "Download"}
                    </Button>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/10 text-foreground border border-border/50"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Details */}
                    <div className="divide-y divide-border/50">
                      {details.map((detail) => (
                        <div key={detail.label} className="flex items-center gap-3 py-3 text-sm">
                          <span className="w-6 h-6 flex items-center justify-center text-muted-foreground shrink-0">
                            {detail.icon}
                          </span>
                          <span className="text-muted-foreground">{detail.label}</span>
                          <span className="ml-auto text-foreground font-medium">{detail.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {similarProducts.length > 0 && (
                <div className="mt-12 pb-4">
                  <h2 className="text-lg font-semibold text-foreground mb-6">Similar Items</h2>
                  <SimilarProducts
                    products={similarProducts}
                    kind={kind}
                    onProductClick={onProductChange}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <SignInModal open={signInOpen} onOpenChange={setSignInOpen} onAuthSuccess={() => setSignInOpen(false)} />
      <SubscriptionModal open={subscriptionOpen} onOpenChange={setSubscriptionOpen} />
      <DownloadStartedModal
        open={downloadStartedOpen}
        itemId={downloadItemId}
        onOpenChange={(o) => {
          setDownloadStartedOpen(o);
          if (!o) setDownloadItemId(null);
        }}
      />
    </>
  );
}
