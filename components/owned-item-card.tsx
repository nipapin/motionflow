import Image from "next/image";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/product-types";
import { productSoftwareLabel, productThumbnailUrl } from "@/lib/product-ui";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

interface OwnedItemCardProps {
  product: Product | null;
  titleFallback: string;
  metaLine?: string;
  dateLabel: string;
  downloadHref: string;
}

export function OwnedItemCard({
  product,
  titleFallback,
  metaLine,
  dateLabel,
  downloadHref,
}: OwnedItemCardProps) {
  const name = product?.name ?? titleFallback;
  const thumb = product ? productThumbnailUrl(product) : "";
  const category = product ? productSoftwareLabel(product) : "";

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-blue-500/30 bg-card/40 p-4 glow sm:flex-row sm:items-center">
      <div className="relative h-28 w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:h-24 sm:w-40">
        {thumb ? (
          <Image src={thumb} alt={name} fill className="object-cover" unoptimized sizes="160px" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No preview</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold leading-snug text-foreground">{name}</h2>
        {category ? (
          <p className="mt-1 text-xs text-muted-foreground">{category}</p>
        ) : null}
        {metaLine ? <p className="mt-1 text-sm text-muted-foreground">{metaLine}</p> : null}
        <p className="mt-1 text-xs text-muted-foreground/80">{dateLabel}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
        <Button
          asChild
          className="w-full bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 sm:w-auto"
        >
          <a href={downloadHref}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </a>
        </Button>
      </div>
    </article>
  );
}

export { formatDate };
