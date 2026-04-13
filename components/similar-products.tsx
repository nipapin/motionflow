import { ProductKind } from "@/lib/product-ui";
import { Product, ProductCard } from "./product-card";
import { AudioTrack } from "./audio-track";

export function SimilarProducts({ products, kind }: { products: Product[]; kind: ProductKind }) {
  if (products.length === 0) return null;
  if (kind === "stock-audio") {
    return (
      <div className="flex flex-col gap-4">
        {products.slice(0, 2).map((product) => (
          <AudioTrack key={product.id} product={product} />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.slice(0, 4).map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
