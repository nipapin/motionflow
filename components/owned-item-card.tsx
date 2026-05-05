"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/product-types";
import { productSoftwareLabel, productThumbnailUrl } from "@/lib/product-ui";
import { startMarketplaceDownload } from "@/lib/open-marketplace-download";

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
  itemId: number;
}

export function OwnedItemCard({
  product,
  titleFallback,
  metaLine,
  dateLabel,
  itemId,
}: OwnedItemCardProps) {
  const name = product?.name ?? titleFallback;
  const thumb = product ? productThumbnailUrl(product) : "";
  const category = product ? productSoftwareLabel(product) : "";

  return (
    <article className="group/owned flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center">
      <div className="relative h-28 w-full shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-inset ring-border/30 sm:h-24 sm:w-40">
        {thumb ? (
          <img src={thumb} alt={name} className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No preview</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">{name}</h2>
        {category ? (
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{category}</p>
        ) : null}
        {metaLine ? <p className="mt-1 text-sm text-muted-foreground">{metaLine}</p> : null}
        <p className="mt-1 text-[11px] text-muted-foreground">{dateLabel}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void startMarketplaceDownload(itemId)}
          className="w-full opacity-90 transition-opacity group-hover/owned:opacity-100 sm:w-auto"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Download
        </Button>
      </div>
    </article>
  );
}

export { formatDate };
