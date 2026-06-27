"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { spunkramSubscriptionTiers, type SpunkramSubscriptionTier } from "@/lib/data";
import { usePaddle } from "@/lib/paddle";
import {
  SPUNKRAM_AUTHOR_ID,
  SPUNKRAM_SUBSCRIPTION_PRICE_IDS,
  type SpunkramSubscriptionTierId,
} from "@/lib/spunkram-paddle-config";

type BillingPeriod = "monthly" | "yearly";

function tierDisplayPrice(tier: SpunkramSubscriptionTier, billing: BillingPeriod) {
  if (billing === "monthly") {
    return {
      amount: tier.monthlyPrice,
      billingNote: "Billed monthly",
    };
  }
  return {
    amount: tier.yearlyPrice / 12,
    billingNote: `Billed yearly · $${Math.round(tier.yearlyPrice)} upfront`,
  };
}

export function Pricing() {
  const router = useRouter();
  const { paddle, ready, subscribe } = usePaddle();
  const { user, openSignIn } = useAuth();
  const [billing, setBilling] = useState<BillingPeriod>("yearly");
  const [openingTier, setOpeningTier] = useState<SpunkramSubscriptionTierId | null>(null);
  const awaitingCheckout = useRef(false);
  const libraryTier = spunkramSubscriptionTiers.find((t) => t.id === "library");

  useEffect(() => {
    return subscribe((event) => {
      if (!awaitingCheckout.current) return;
      if (event.name === "checkout.completed") {
        awaitingCheckout.current = false;
        setOpeningTier(null);
        toast.success("Payment successful! Your subscription is activating…");
        router.push("/account?checkout=success");
      }
      if (event.name === "checkout.error") {
        awaitingCheckout.current = false;
        setOpeningTier(null);
        toast.error("Checkout error. Please try again.");
      }
      if (event.name === "checkout.closed") {
        awaitingCheckout.current = false;
        setOpeningTier(null);
      }
    });
  }, [subscribe, router]);

  const openSubscribeCheckout = (tierId: SpunkramSubscriptionTierId) => {
    if (!user) {
      openSignIn("signin");
      return;
    }

    const priceId = SPUNKRAM_SUBSCRIPTION_PRICE_IDS[tierId][billing];

    if (!priceId?.startsWith("pri_")) {
      toast.error("Subscription checkout is not configured.");
      return;
    }

    if (!paddle) {
      toast.error(
        ready ? "Checkout is not ready yet. Please try again." : "Checkout is still loading…",
      );
      return;
    }

    setOpeningTier(tierId);
    awaitingCheckout.current = true;

    try {
      paddle.Checkout.open({
        settings: {
          displayMode: "overlay",
          theme: "light",
          allowLogout: false,
        },
        items: [{ priceId, quantity: 1 }],
        customer: { email: user.email ?? undefined },
        customData: {
          buyer_id: Number(user.id),
          kind: "spunkram_subscription",
          author_id: Number(SPUNKRAM_AUTHOR_ID),
          billingPeriod: billing,
          tier: tierId,
        },
      });
    } catch (err) {
      awaitingCheckout.current = false;
      setOpeningTier(null);
      console.error("[spunkram-pricing] paddle checkout open failed:", err);
      toast.error("Could not open checkout. Please try again.");
    }
  };

  return (
    <section
      id="pricing"
      className="relative overflow-hidden py-24 sm:py-28"
    >
      <div
        className="pricing-section-ambient pointer-events-none absolute left-1/2 top-[46%] z-0 h-[min(28rem,88vw)] w-[min(48rem,130vw)] -translate-x-1/2 -translate-y-1/2 opacity-80 light:opacity-55"
        aria-hidden="true"
      >
        <div
          className="pointer-events-none h-full w-full blur-3xl sm:blur-[88px]"
          style={{
            background:
              "radial-gradient(ellipse 62% 54% at 50% 50%, rgb(124 77 255 / 0.34) 0%, rgb(167 139 250 / 0.14) 44%, rgb(124 77 255 / 0.05) 58%, transparent 72%)",
          }}
        />
      </div>
      <div className="relative z-1 max-w-6xl mx-auto px-5 sm:px-8 pointer-events-auto">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            Choose your plan
          </h2>
          <p className="mt-2 text-muted">
            Get the full Spunkram library or add AI Tools for image, video, and
            audio generation. Cancel anytime.
          </p>
        </div>

        <div className="relative z-[2] mt-8 flex justify-center pointer-events-auto">
          <div className="relative z-[2] inline-flex items-center gap-0.5 rounded-2xl p-0.5 card">
            <button
              type="button"
              onClick={() => setBilling("monthly")}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium transition ${
                billing === "monthly"
                  ? "bg-brand-violet-soft text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22)]"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBilling("yearly")}
              className={`flex items-center gap-2 rounded-xl px-4 py-1.5 text-sm font-medium transition ${
                billing === "yearly"
                  ? "bg-brand-violet-soft text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22)]"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Yearly
              {libraryTier?.savings && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-white border border-white/10 light:border-black/10">
                  {libraryTier.savings}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
          {spunkramSubscriptionTiers.map((tier) => {
            const { amount, billingNote } = tierDisplayPrice(tier, billing);
            const isOpening = openingTier === tier.id;

            return (
              <div key={tier.id} className="relative">
                {tier.highlight && (
                  <div className="pointer-events-none absolute left-1/2 top-0 z-[2] -translate-x-1/2 -translate-y-1/2">
                    <span className="inline-flex items-center rounded-full border border-brand-500/40 bg-brand-violet px-4 py-1.5 text-xs font-semibold tracking-wide text-white shadow-[0_8px_24px_-12px_rgb(110_60_255/0.75)]">
                      Most Popular
                    </span>
                  </div>
                )}

                <div
                  className={`card relative isolate overflow-hidden rounded-[28px] p-8 sm:p-9 ${
                    tier.highlight
                      ? "!border-[3px] !border-brand-500 shadow-[0_0_52px_-10px_rgb(124_77_255/0.8)]"
                      : "border border-brand-500/25"
                  }`}
                >
                <div className="card-sheen-pricing pointer-events-none absolute inset-0 z-0" />

                <div className="relative z-[1]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-xl font-semibold tracking-tight text-foreground">
                        {tier.name}
                      </h3>
                      <p className="mt-1 text-sm text-muted">{billingNote}</p>
                    </div>
                    {billing === "yearly" && tier.savings && !tier.highlight && (
                      <span className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-500 border border-brand-500/25">
                        {tier.savings}
                      </span>
                    )}
                  </div>

                  <div className="mt-7 flex items-end gap-2">
                    <span className="text-5xl font-semibold tracking-tight text-foreground tabular-nums leading-none">
                      ${amount.toFixed(1)}
                    </span>
                    <span className="pb-1 text-sm text-subtle">/ month</span>
                  </div>

                  <div className="mt-7 border-t border-line/60" />

                  <ul className="mt-7 space-y-3.5">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-3 text-sm">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-400/25">
                          <svg
                            className="h-3 w-3"
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M5 10.5l3 3 7-7" />
                          </svg>
                        </span>
                        <span className="text-muted leading-snug">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8">
                    <button
                      type="button"
                      onClick={() => openSubscribeCheckout(tier.id)}
                      disabled={isOpening}
                      className={`w-full rounded-full px-6 py-3 text-sm font-semibold transition-[background-image,box-shadow] duration-200 disabled:pointer-events-none disabled:opacity-60 ${
                        tier.highlight
                          ? "bg-brand-violet hover:bg-brand-violet-hover text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22),0_14px_40px_-22px_rgb(110_60_255/0.65)]"
                          : "border border-line bg-surface/50 text-foreground hover:bg-surface"
                      }`}
                    >
                      {isOpening ? "Opening checkout…" : "Subscribe now"}
                    </button>
                  </div>
                </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-subtle">
          Secure checkout · Prices in USD · Cancel anytime
        </p>
      </div>
    </section>
  );
}
