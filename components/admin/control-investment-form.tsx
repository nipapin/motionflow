"use client";

import * as React from "react";
import { toast } from "sonner";
import type { InvestorOption } from "@/lib/admin/control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requestInvestmentAction } from "@/app/(adminzone)/_actions/control";

export function ControlInvestmentForm({ investors }: { investors: InvestorOption[] }) {
  const [investorUserId, setInvestorUserId] = React.useState<number>(investors[0]?.user_id ?? 0);
  const [amount, setAmount] = React.useState<number>(0);
  const [description, setDescription] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function submit() {
    startTransition(async () => {
      const r = await requestInvestmentAction({
        investorUserId: Number(investorUserId),
        amount: Number(amount),
        description,
      });
      if (r.ok) {
        toast.success(r.message);
        setAmount(0);
        setDescription("");
      } else {
        toast.error(r.error);
      }
    });
  }

  if (investors.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No investor setup rows in `invest_analyses` (`status = setup`). Configure investors via the search-by-DB tool first.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="investor">Investor</Label>
        <select
          id="investor"
          value={investorUserId}
          onChange={(e) => setInvestorUserId(Number(e.target.value))}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {investors.map((i) => (
            <option key={i.user_id} value={i.user_id}>
              {i.name} (remaining ${i.remaining})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="amount">Amount (USD)</Label>
        <Input
          id="amount"
          type="number"
          min={1}
          value={amount || ""}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
      </div>
      <div className="sm:col-span-2 space-y-1.5">
        <Label htmlFor="desc">Description</Label>
        <Textarea
          id="desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Reason for the request"
        />
      </div>
      <div className="sm:col-span-2">
        <Button onClick={submit} disabled={pending || !investorUserId || amount <= 0}>
          Create request
        </Button>
      </div>
    </div>
  );
}
