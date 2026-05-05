"use client";

import { useEffect, useState } from "react";
import { CircleDot, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Product } from "@/lib/product-types";
import { soldLicenseTitle } from "@/lib/purchase-display";
import { productThumbnailUrl } from "@/lib/product-ui";
import { startMarketplaceDownload } from "@/lib/open-marketplace-download";

export interface PurchaseItemCardProps {
  product: Product | null;
  titleFallback: string;
  itemId: number;
  soldItemId: number;
  license: number;
  purchaseCode: string | null;
  itemPageUrl: string;
  invoiceUrl: string;
}

const NOTIFY_STORAGE_PREFIX = "mf:purchase-notify:";

function formatVersionBadge(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  return /^v[\d.]/i.test(t) ? t : `v${t}`;
}

export function PurchaseItemCard({
  product,
  titleFallback,
  itemId,
  soldItemId,
  license,
  purchaseCode,
  itemPageUrl,
  invoiceUrl,
}: PurchaseItemCardProps) {
  const name = product?.name ?? titleFallback;
  const thumb = product ? productThumbnailUrl(product) : "";
  const versionBadge = formatVersionBadge(product?.attributes?.ae_version);
  const licenseTitle = soldLicenseTitle(product, license);
  const licenseLine = `${licenseTitle} x 1 Qty`;

  const [notify, setNotify] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${NOTIFY_STORAGE_PREFIX}${itemId}`);
      if (raw === "0") setNotify(false);
      if (raw === "1") setNotify(true);
    } catch {
      /* ignore */
    }
  }, [itemId]);

  const onNotifyChange = (checked: boolean) => {
    setNotify(checked);
    try {
      localStorage.setItem(`${NOTIFY_STORAGE_PREFIX}${itemId}`, checked ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const copyCode = async () => {
    if (!purchaseCode) return;
    try {
      await navigator.clipboard.writeText(purchaseCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <article className="group/purchase overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-stretch lg:gap-6">
        <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-inset ring-border/35 sm:h-36 lg:h-auto lg:w-40 lg:min-h-36">
          {thumb ? (
            <img src={thumb} alt={name} className="absolute inset-0 size-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No preview</div>
          )}
          {versionBadge ? (
            <span className="absolute right-2 top-2 rounded-md bg-background/95 px-2 py-0.5 text-[0.7rem] font-medium text-foreground shadow-sm backdrop-blur-sm">
              {versionBadge}
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="text-base font-semibold leading-snug tracking-tight sm:text-[17px]">
            <a
              href={itemPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline decoration-border/70 underline-offset-4 transition-colors hover:decoration-foreground/40"
            >
              {name}
            </a>
          </h2>
          <p className={license > 1 ? "text-[13px] font-medium text-foreground/90" : "text-[13px] text-muted-foreground"}>
            {licenseLine}
          </p>
          <p className="text-sm text-muted-foreground">
            <span>View the </span>
            <a
              href={invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 smooth hover:text-foreground"
            >
              Invoice #{soldItemId}
            </a>
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:max-w-md">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Purchase code</p>
            <div className="flex min-w-0 items-stretch gap-2 rounded-xl border border-border bg-muted/25 px-3 py-2">
              <div className="min-w-0 flex-1 overflow-x-auto">
                <p className="whitespace-nowrap font-mono text-[0.75rem] leading-relaxed text-foreground sm:text-sm">
                  {purchaseCode ?? "—"}
                </p>
              </div>
              {purchaseCode ? (
                <button
                  type="button"
                  onClick={copyCode}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 text-muted-foreground smooth hover:bg-muted hover:text-foreground"
                  title="Copy purchase code"
                >
                  {copied ? (
                    <span className="text-[0.65rem] font-medium text-emerald-600">OK</span>
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
              ) : (
                <span className="inline-flex shrink-0 items-center p-1.5 text-muted-foreground/50" aria-hidden>
                  <CircleDot className="size-4" />
                </span>
              )}
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-muted-foreground">
            <Checkbox
              checked={notify}
              onCheckedChange={(v) => onNotifyChange(v === true)}
              className="mt-0.5 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
            <span>Email me when this item is updated</span>
          </label>
        </div>

        <div className="flex shrink-0 flex-row items-center justify-end border-t border-border/50 pt-4 lg:flex-col lg:items-end lg:border-t-0 lg:pt-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void startMarketplaceDownload(itemId)}
            className="h-9 px-4 font-medium opacity-90 transition-opacity group-hover/purchase:opacity-100"
          >
            <Download className="size-3.5" />
            Download
          </Button>
        </div>
      </div>
    </article>
  );
}
