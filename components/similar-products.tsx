import { ProductKind } from "@/lib/product-ui";
import { Product, ProductCard } from "./product-card";
import { AudioTrack } from "./audio-track";

interface SimilarProductsProps {
  products: Product[];
  kind: ProductKind;
  onProductClick?: (product: Product) => void;
}

export function SimilarProducts({ products, kind, onProductClick }: SimilarProductsProps) {
  if (products.length === 0) return null;
  if (kind === "stock-audio" || kind === "sound-fx") {
    return (
      <div className="flex flex-col divide-y divide-border/50 rounded-2xl border border-border/50 overflow-hidden bg-card/50">
        {products.map((product) => (
          <AudioTrack
            key={product.id}
            product={product}
            onClick={() => onProductClick?.(product)}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onClick={() => onProductClick?.(product)}
        />
      ))}
    </div>
  );
}
