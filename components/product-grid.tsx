"use client";

import { useState, useEffect, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import { ProductCard } from "./product-card";
import type { Product } from "@/lib/product-types";
import { productCategoryLabel, productKind, productSoftwareLabel } from "@/lib/product-ui";
import { AudioTrack } from "./audio-track";
import { ProductDetailModal } from "./product-detail-modal";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const softwareCategories = [
  "After Effects",
  "Premiere Pro",
  "DaVinci Resolve",
  "Illustrator",
  "Stock Music",
  "Sound FX",
];

interface ProductGridProps {
  products: Product[];
  title?: string;
  onDownload?: (product: Product) => void;
  showCategoryFilter?: boolean;
  selectedSoftware?: string;
  onSoftwareChange?: (software: string) => void;
  sentinelRef?: RefObject<HTMLDivElement | null>;
  isLoadingMore?: boolean;
}

export function ProductGrid({ 
  products, 
  title, 
  onDownload, 
  showCategoryFilter = false,
  selectedSoftware = "After Effects",
  onSoftwareChange,
  sentinelRef,
  isLoadingMore,
}: ProductGridProps) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (selectedProduct || products.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("product");
    if (!raw) return;
    const id = parseInt(raw, 10);
    if (!Number.isFinite(id)) return;
    const match = products.find((p) => p.id === id);
    if (match) setSelectedProduct(match);
  }, [products, selectedProduct]);

  const templateProducts = products.filter((p) => productKind(p) === "template");
  const audioProducts = products.filter((p) => {
    const k = productKind(p);
    return k === "stock-audio" || k === "sound-fx";
  });

  const getSimilarProducts = (product: Product) => {
    const sw = productSoftwareLabel(product);
    const cat = productCategoryLabel(product);
    return products
      .filter(
        (p) =>
          p.id !== product.id &&
          (productSoftwareLabel(p) === sw || productCategoryLabel(p) === cat)
      )
      .slice(0, 8);
  };

  return (
    <section className="mb-12">
      {title && (
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-semibold text-foreground tracking-tight">{title}</h2>
          
          {showCategoryFilter && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-blue-500/30 hover:border-blue-500 text-foreground hover:bg-blue-500/10 bg-transparent rounded-full px-4">
                  {selectedSoftware}
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover border-border">
                {softwareCategories.map((category) => (
                  <DropdownMenuItem 
                    key={category} 
                    onClick={() => onSoftwareChange?.(category)}
                    className="text-popover-foreground hover:bg-blue-500/10 cursor-pointer"
                  >
                    {category}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {templateProducts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {templateProducts.map((product) => (
            <ProductCard 
              key={product.id} 
              product={product} 
              onDownload={onDownload}
              onClick={() => setSelectedProduct(product)}
            />
          ))}
        </div>
      )}

      {audioProducts.length > 0 && (
        <div className={templateProducts.length > 0 ? "mt-10" : ""}>
          <div className="flex flex-col divide-y divide-border/50 rounded-2xl border border-border/50 overflow-hidden bg-card/50">
            {audioProducts.map((product) => (
              <AudioTrack
                key={product.id}
                product={product}
                onDownload={onDownload}
                onClick={() => setSelectedProduct(product)}
              />
            ))}
          </div>
        </div>
      )}

      {sentinelRef && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          {isLoadingMore && <Spinner className="w-6 h-6 text-muted-foreground" />}
        </div>
      )}

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          open={!!selectedProduct}
          onOpenChange={(open) => !open && setSelectedProduct(null)}
          similarProducts={getSimilarProducts(selectedProduct)}
          onProductChange={setSelectedProduct}
        />
      )}
    </section>
  );
}
