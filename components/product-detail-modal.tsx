"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { X, Heart, Play, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { SignInModal } from "@/components/sign-in-modal";
import type { Product } from "@/lib/product-types";
import {
  productCardVideoSrc,
  productCategoryLabel,
  productKind,
  productPreviewVideoUrl,
  productSoftwareLabel,
  productThumbnailUrl,
} from "@/lib/product-ui";
import { AudioTrack } from "./audio-track";
import { SimilarProducts } from "./similar-products";

interface ProductDetailModalProps {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  similarProducts?: Product[];
}

export function ProductDetailModal({ product, open, onOpenChange, similarProducts = [] }: ProductDetailModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

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

  if (!open) return null;

  const tagParts = product.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const tags = [
    ...tagParts,
    productSoftwareLabel(product),
    kind === "template" ? "Template" : kind === "stock-audio" ? "Stock Audio" : "SFX",
  ];

  const details = [
    { label: "Category", value: productCategoryLabel(product) },
    { label: "Software", value: productSoftwareLabel(product) },
    { label: "Size", value: product.attributes?.size || "—" },
    { label: "Plugins", value: product.attributes?.plugins || "—" },
  ];

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
    } else {
      router.push("/pricing");
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm overflow-y-auto flex items-center justify-center"
        onClick={() => onOpenChange(false)}
      >
        <div className="dark w-full max-w-7xl my-8 px-4 flex flex-col min-h-[calc(100vh-4rem)]">
          {/* Header */}
          <div className="flex items-center justify-end mb-6 shrink-0">
            <button
              onClick={() => onOpenChange(false)}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 smooth"
            >
              <X className="w-5 h-5" />
            </button>
            {/* <button
              onClick={(e) => {
                e.stopPropagation();
                setIsFavorite(!isFavorite);
              }}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center smooth",
                isFavorite ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white hover:bg-white/20",
              )}
            >
              <Heart className={cn("w-5 h-5", isFavorite && "fill-current")} />
            </button> */}
          </div>

          {/* Main content — vertically centered when short */}
          <div className="flex-1 flex items-center" onClick={(e) => e.stopPropagation()}>
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
                {kind === "stock-audio" && (
                  <div className="flex-1 w-full flex items-center justify-center">
                    <AudioTrack
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
                      className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-medium mt-6 mb-6 shadow-lg shadow-blue-500/25"
                    >
                      <ArrowRight className="w-5 h-5 mr-2" />
                      {user ? "Get Access" : "Sign in to Download"}
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
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-3">Details</h3>
                      <div className="space-y-2.5">
                        {details.map((detail) => (
                          <div key={detail.label} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{detail.label}</span>
                            <span className="text-foreground font-medium">{detail.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Similar Items */}
              {similarProducts.length > 0 && (
                <div className="mt-12">
                  <h2 className="text-lg font-semibold text-foreground mb-6">Similar Items</h2>
                  <SimilarProducts products={similarProducts} kind={kind} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <SignInModal open={signInOpen} onOpenChange={setSignInOpen} onAuthSuccess={() => setSignInOpen(false)} />
    </>
  );
}

// const simThumb = productThumbnailUrl(item);
// return (
//   <div
//     key={item.id}
//     className="relative aspect-video rounded-xl overflow-hidden bg-card border border-blue-500/20 cursor-pointer hover:border-blue-500 smooth group"
//   >
//     {simThumb ? (
//       <Image
//         src={simThumb}
//         alt={item.name}
//         fill
//         sizes="(max-width: 640px) 50vw, 25vw"
//         className="object-cover group-hover:scale-105 smooth"
//         unoptimized
//       />
//     ) : (
//       <div className="w-full h-full bg-muted" aria-hidden />
//     )}
//     <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 smooth" />
//     <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 smooth">
//       <p className="text-xs text-white font-medium line-clamp-1">{item.name}</p>
//     </div>
//   </div>
// );
