"use client";

import { useState } from "react";
import type { Product } from "@/lib/product-types";
import { ProductCard } from "@/components/product-card";
import { AudioTrack } from "@/components/audio-track";
import { ProductDetailModal } from "@/components/product-detail-modal";
import { productKind } from "@/lib/product-ui";

interface FavoritesListProps {
  initialProducts: Product[];
}

export function FavoritesList({ initialProducts }: FavoritesListProps) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const templates = initialProducts.filter((p) => productKind(p) === "template");
  const audio = initialProducts.filter((p) => {
    const k = productKind(p);
    return k === "stock-audio" || k === "sfx";
  });

  return (
    <>
      {templates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {templates.map((p) => (
            <ProductCard key={p.id} product={p} onClick={() => setSelectedProduct(p)} />
          ))}
        </div>
      )}

      {audio.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm divide-y divide-border/40 overflow-hidden">
          {audio.map((p) => (
            <AudioTrack key={p.id} product={p} onClick={() => setSelectedProduct(p)} />
          ))}
        </div>
      )}

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          open
          onOpenChange={(open) => { if (!open) setSelectedProduct(null); }}
          onProductChange={setSelectedProduct}
        />
      )}
    </>
  );
}
