"use client";

import * as React from "react";
import { toast } from "sonner";
import { usePaddle } from "@/lib/paddle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  defaultEmail: string | null;
  hasClientToken: boolean;
};

export function PaddleTestCheckoutForm({ defaultEmail, hasClientToken }: Props) {
  const { paddle, ready } = usePaddle();
  const [priceId, setPriceId] = React.useState("");
  const [quantity, setQuantity] = React.useState<number>(1);
  const [email, setEmail] = React.useState(defaultEmail ?? "");
  const [discountId, setDiscountId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const open = React.useCallback(() => {
    if (!paddle) {
      toast.error("Paddle.js is still initialising. Try again in a moment.");
      return;
    }
    if (!priceId) {
      toast.error("priceId is required");
      return;
    }
    setBusy(true);
    try {
      paddle.Checkout.open({
        items: [{ priceId, quantity: Number(quantity) || 1 }],
        customer: email ? { email } : undefined,
        discountId: discountId || undefined,
        settings: {
          theme: "dark",
          displayMode: "overlay",
        },
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to open checkout");
    } finally {
      setBusy(false);
    }
  }, [paddle, priceId, quantity, email, discountId]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="priceId">Paddle priceId (pri_…)</Label>
          <Input
            id="priceId"
            value={priceId}
            onChange={(e) => setPriceId(e.target.value)}
            placeholder="pri_01abcd…"
            spellCheck={false}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qty">Quantity</Label>
          <Input
            id="qty"
            type="number"
            min={1}
            max={20}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">Customer email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="someone@example.com"
            spellCheck={false}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="discount">Discount ID (optional)</Label>
          <Input
            id="discount"
            value={discountId}
            onChange={(e) => setDiscountId(e.target.value)}
            placeholder="dsc_01abcd…"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={open} disabled={busy || !hasClientToken || !ready || !priceId}>
          Open Paddle overlay
        </Button>
        {!hasClientToken ? (
          <p className="text-xs text-destructive">
            <code>NEXT_PUBLIC_PADDLE_CLIENT_TOKEN</code> is not set on the server.
          </p>
        ) : !ready ? (
          <p className="text-xs text-muted-foreground">Loading paddle.js…</p>
        ) : (
          <p className="text-xs text-muted-foreground">Sandbox mode unless `NEXT_PUBLIC_PADDLE_ENVIRONMENT=production`.</p>
        )}
      </div>
    </div>
  );
}
