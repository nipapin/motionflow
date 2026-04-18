"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Product } from "@/lib/product-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OwnedItemCard, formatDate } from "@/components/owned-item-card";

export interface DownloadListItem {
  id: number;
  itemId: number;
  product: Product | null;
  titleFallback: string;
  createdAt: string | null;
  downloadUrl: string;
}

function displayName(row: DownloadListItem): string {
  return row.product?.name ?? row.titleFallback;
}

type Period = "all" | "day" | "week" | "month";

/** Rolling window cutoffs (ms since epoch); `all` → no filter. */
function periodCutoffMs(period: Period): number | null {
  if (period === "all") return null;
  const now = Date.now();
  if (period === "day") return now - 24 * 60 * 60 * 1000;
  if (period === "week") return now - 7 * 24 * 60 * 60 * 1000;
  return now - 30 * 24 * 60 * 60 * 1000;
}

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "day", label: "Last day" },
  { id: "week", label: "Last week" },
  { id: "month", label: "Last month" },
];

interface DownloadsListProps {
  items: DownloadListItem[];
}

export function DownloadsList({ items }: DownloadsListProps) {
  const [nameQuery, setNameQuery] = useState("");
  const [period, setPeriod] = useState<Period>("all");

  const filtered = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    const cut = periodCutoffMs(period);
    return items.filter((row) => {
      if (q) {
        const name = displayName(row).toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (cut !== null) {
        const t = row.createdAt ? new Date(row.createdAt).getTime() : NaN;
        if (Number.isNaN(t) || t < cut) return false;
      }
      return true;
    });
  }, [items, nameQuery, period]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My downloads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length} unique item{items.length === 1 ? "" : "s"} from your subscription downloads
          {filtered.length !== items.length ? (
            <span className="text-foreground"> — showing {filtered.length}</span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-row flex-nowrap items-end gap-3 rounded-2xl border border-blue-500/20 bg-card/30 p-4">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="dl-search-name">Search by name</Label>
          <Input
            id="dl-search-name"
            type="search"
            placeholder="Name…"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            className="rounded-xl border border-blue-500/35 bg-background/50 shadow-sm"
          />
        </div>
        <div className="w-40 shrink-0 space-y-2 sm:w-56">
          <Label htmlFor="dl-period">Time range</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger
              id="dl-period"
              className="h-9 w-full rounded-xl border border-blue-500/35 bg-background/50 shadow-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(({ id, label }) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-blue-500/30 bg-card/40 px-6 py-10 text-center glow">
          <p className="text-sm text-muted-foreground">No downloads match your filters.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {filtered.map((row) => (
            <li key={row.id}>
              <OwnedItemCard
                product={row.product}
                titleFallback={row.titleFallback}
                dateLabel={`Downloaded ${formatDate(row.createdAt)}`}
                downloadHref={row.downloadUrl}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
