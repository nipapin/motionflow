"use client";

import { useState } from "react";
import Image from "next/image";
import { X, Download, Heart, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/product-types";
import {
  productCategoryLabel,
  productKind,
  productSoftwareLabel,
  productThumbnailUrl,
} from "@/lib/product-ui";

interface ProductDetailModalProps {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload?: () => void;
  similarProducts?: Product[];
}

export function ProductDetailModal({ 
  product, 
  open, 
  onOpenChange, 
  onDownload,
  similarProducts = []
}: ProductDetailModalProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  if (!open) return null;

  const kind = productKind(product);
  const heroThumb = productThumbnailUrl(product);
  const tagParts = product.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const tags = [
    ...tagParts,
    productSoftwareLabel(product),
    kind === "template" ? "Template" : kind === "music" ? "Music" : "SFX",
  ];

  const details = [
    { label: "Category", value: productCategoryLabel(product) },
    { label: "Applications / Index", value: productSoftwareLabel(product) },
    { label: "Price", value: product.price > 0 ? `$${product.price}` : "—" },
    { label: "Subscription", value: product.subscription === 1 ? "Included" : "—" },
  ];

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm overflow-y-auto"
      onClick={() => onOpenChange(false)}
    >
      <div className="min-h-screen py-8 px-4">
        {/* Header */}
        <div className="max-w-7xl mx-auto flex items-center justify-between mb-6">
          <button
            onClick={() => onOpenChange(false)}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 smooth"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsFavorite(!isFavorite)}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center smooth",
              isFavorite ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white hover:bg-white/20"
            )}
          >
            <Heart className={cn("w-5 h-5", isFavorite && "fill-current")} />
          </button>
        </div>

        {/* Main content */}
        <div 
          className="max-w-7xl mx-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Video Preview */}
            <div className="flex-1">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-blue-500/20">
                {/* Category Badge */}
                <div className="absolute top-4 right-4 z-10">
                  <span className="text-xs px-3 py-1.5 rounded-full font-medium backdrop-blur-md bg-blue-500/90 text-white">
                    {productSoftwareLabel(product)}
                  </span>
                </div>
                {heroThumb ? (
                  <Image
                    src={heroThumb}
                    alt={product.name}
                    fill
                    sizes="(max-width: 1024px) 100vw, 66vw"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full bg-muted" aria-hidden />
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 smooth"
                  >
                    {isPlaying ? (
                      <Pause className="w-8 h-8 text-white" />
                    ) : (
                      <Play className="w-8 h-8 text-white ml-1" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Info Sidebar */}
            <div className="w-full lg:w-96 shrink-0">
              <div className="bg-card/50 backdrop-blur-xl rounded-2xl border border-blue-500/20 p-6">
                <h1 className="text-xl font-semibold text-foreground mb-6 leading-tight">
                  {product.name}
                </h1>

                <Button 
                  onClick={onDownload}
                  className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium mb-6"
                >
                  <Download className="w-5 h-5 mr-2" />
                  {product.price > 0 ? `Buy $${product.price}` : "Download"}
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {similarProducts.slice(0, 4).map((item) => {
                  const simThumb = productThumbnailUrl(item);
                  return (
                  <div 
                    key={item.id}
                    className="relative aspect-video rounded-xl overflow-hidden bg-card border border-blue-500/20 cursor-pointer hover:border-blue-500 smooth group"
                  >
                    {simThumb ? (
                      <Image
                        src={simThumb}
                        alt={item.name}
                        fill
                        sizes="(max-width: 640px) 50vw, 25vw"
                        className="object-cover group-hover:scale-105 smooth"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full bg-muted" aria-hidden />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 smooth" />
                    <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 smooth">
                      <p className="text-xs text-white font-medium line-clamp-1">{item.name}</p>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
