"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AffiliatePeriodKey } from "@/lib/affiliate/stats";

interface AffiliatePeriodFilterProps {
  basePath: string;
  periodKey: AffiliatePeriodKey;
  from: string;
  to: string;
}

const PRESETS: { key: Exclude<AffiliatePeriodKey, "custom">; label: string }[] = [
  { key: "current-month", label: "Current month" },
  { key: "last-month", label: "Last month" },
];

/** Period presets plus a custom range. Months are UTC, like the payout cycle. */
export function AffiliatePeriodFilter({
  basePath,
  periodKey,
  from,
  to,
}: AffiliatePeriodFilterProps) {
  const router = useRouter();
  const [customOpen, setCustomOpen] = useState(periodKey === "custom");
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    const qs = new URLSearchParams({ date: "custom", from: customFrom, to: customTo });
    router.push(`${basePath}?${qs.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      {PRESETS.map((preset) => (
        <Button
          key={preset.key}
          size="sm"
          variant={periodKey === preset.key ? "default" : "outline"}
          onClick={() => router.push(`${basePath}?date=${preset.key}`)}
        >
          {preset.label}
        </Button>
      ))}
      <Button
        size="sm"
        variant={periodKey === "custom" ? "default" : "outline"}
        onClick={() => setCustomOpen((open) => !open)}
      >
        Custom range
      </Button>

      {customOpen ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="affiliate-period-from" className="text-xs text-muted-foreground">
              From (UTC)
            </Label>
            <Input
              id="affiliate-period-from"
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="affiliate-period-to" className="text-xs text-muted-foreground">
              To (UTC)
            </Label>
            <Input
              id="affiliate-period-to"
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 w-[150px]"
            />
          </div>
          <Button size="sm" onClick={applyCustom} disabled={!customFrom || !customTo}>
            Apply
          </Button>
        </div>
      ) : null}
    </div>
  );
}
