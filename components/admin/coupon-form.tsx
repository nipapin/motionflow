"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CouponRow } from "@/lib/admin/coupons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  createCouponAction,
  updateCouponAction,
} from "@/app/(adminzone)/_actions/coupons";

function isoDate(s: string | null | undefined): string {
  if (!s) return "";
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

export function CouponForm({ coupon }: { coupon?: CouponRow }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [code, setCode] = React.useState(coupon?.code ?? "");
  const [type, setType] = React.useState(coupon?.type ?? "percent");
  const [amount, setAmount] = React.useState<number>(Number(coupon?.amount ?? 10));
  const [globalCoverage, setGlobalCoverage] = React.useState(Number(coupon?.assigned_id ?? 0) === 0);
  const [itemId, setItemId] = React.useState<number>(Number(coupon?.assigned_id ?? 0) || 0);
  const [activePeriod, setActivePeriod] = React.useState(Boolean(coupon?.start_date && coupon?.end_date));
  const [startDate, setStartDate] = React.useState(isoDate(coupon?.start_date));
  const [endDate, setEndDate] = React.useState(isoDate(coupon?.end_date));
  const [unlimitedUses, setUnlimitedUses] = React.useState(coupon ? coupon.max_uses == null : false);
  const [maxUses, setMaxUses] = React.useState<number>(Number(coupon?.max_uses ?? 100));
  const [priority, setPriority] = React.useState(Boolean(coupon?.priority ?? 0));
  const [comment, setComment] = React.useState(coupon?.comment ?? "");

  function submit() {
    startTransition(async () => {
      const payload = {
        type,
        amount: Number(amount),
        globalCoverage,
        itemId: globalCoverage ? null : itemId,
        startDate: activePeriod ? startDate : null,
        endDate: activePeriod ? endDate : null,
        maxUses: unlimitedUses ? null : Number(maxUses),
        priority,
        comment,
      };
      const r = coupon
        ? await updateCouponAction({ id: coupon.id, ...payload })
        : await createCouponAction({ ...payload, code });
      if (r.ok) {
        toast.success(coupon ? "Coupon updated" : "Coupon created");
        if (!coupon && r.id) {
          router.push(`/adminzone/coupons/edit?id=${r.id}`);
          router.refresh();
        } else {
          router.refresh();
        }
      } else {
        toast.error(r.error ?? "Failed");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="code">Coupon code</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
            disabled={Boolean(coupon)}
            placeholder="SUMMER10"
            maxLength={50}
          />
          {coupon ? (
            <p className="text-xs text-muted-foreground">Code is immutable after creation.</p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="type">Discount type</Label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="percent">Percent</option>
              <option value="value">Value</option>
              <option value="fixed">Fixed price</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              min={5}
              max={type === "percent" ? 100 : 500}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Global coverage</p>
            <p className="text-xs text-muted-foreground">Apply to all eligible items rather than a single project.</p>
          </div>
          <Switch checked={globalCoverage} onCheckedChange={setGlobalCoverage} />
        </div>
        {!globalCoverage ? (
          <div className="space-y-2">
            <Label htmlFor="itemId">Marketplace item ID</Label>
            <Input
              id="itemId"
              type="number"
              min={1}
              value={itemId || ""}
              onChange={(e) => setItemId(Number(e.target.value))}
            />
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Active period</p>
          <Switch checked={activePeriod} onCheckedChange={setActivePeriod} />
        </div>
        {activePeriod ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="start">Starts</Label>
              <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">Ends</Label>
              <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Unlimited uses</p>
          <Switch checked={unlimitedUses} onCheckedChange={setUnlimitedUses} />
        </div>
        {!unlimitedUses ? (
          <div className="space-y-1.5">
            <Label htmlFor="maxUses">Max uses</Label>
            <Input
              id="maxUses"
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
            />
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Priority coupon</p>
            <p className="text-xs text-muted-foreground">Stacks before regular discounts.</p>
          </div>
          <Switch checked={priority} onCheckedChange={setPriority} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="comment">Comment (≤ 100 chars)</Label>
        <Textarea
          id="comment"
          rows={2}
          maxLength={100}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={submit} disabled={pending || (!coupon && !code.trim())}>
          {coupon ? "Save changes" : "Create coupon"}
        </Button>
        <Button variant="outline" type="button" disabled={pending} onClick={() => router.push("/adminzone/coupons")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
