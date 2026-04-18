"use client";

import { useEffect, useState } from "react";
import { CircleDot, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Product } from "@/lib/product-types";
import { soldLicenseTitle } from "@/lib/purchase-display";
import { productThumbnailUrl } from "@/lib/product-ui";

export interface PurchaseItemCardProps {
  product: Product | null;
  titleFallback: string;
  itemId: number;
  soldItemId: number;
  license: number;
  purchaseCode: string | null;
  itemPageUrl: string;
  downloadUrl: string;
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
  downloadUrl,
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
    <article className="overflow-hidden rounded-2xl border border-blue-500/30 bg-card/80 shadow-sm glow">
      <div className="flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-stretch lg:gap-6">
        <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:h-36 lg:h-auto lg:w-40 lg:min-h-36">
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
          <h2 className="text-base font-semibold leading-snug sm:text-lg">
            <a
              href={itemPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {name}
            </a>
          </h2>
          <p
            className={
              license > 1
                ? "text-sm font-medium text-primary"
                : "text-sm text-sky-500 dark:text-sky-400/90"
            }
          >
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
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-primary">
            <Checkbox
              checked={notify}
              onCheckedChange={(v) => onNotifyChange(v === true)}
              className="mt-0.5 border-primary/60 data-[state=checked]:bg-primary"
            />
            <span>Get notified by email if this item is updated</span>
          </label>
        </div>

        <div className="flex shrink-0 flex-row items-center justify-end border-t border-blue-500/10 pt-4 lg:flex-col lg:items-end lg:border-t-0 lg:pt-0">
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-11 rounded-xl border-2 border-foreground/80 bg-background px-6 font-medium text-foreground shadow-none smooth hover:bg-muted"
          >
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
              <Download className="size-5" />
              Download
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}
