"use client";

import { SpunkramText, useSpunkramLanguage } from "@/components/spunkram-language";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import {
  spunkramSubscriptionTiers,
  type SpunkramSubscriptionTier,
  type SpunkramSubscriptionTierId,
} from "@/lib/data";
import { usePaddle } from "@/lib/paddle";
import { SPUNKRAM_AUTHOR_ID, SPUNKRAM_SUBSCRIPTION_PRICE_IDS } from "@/lib/spunkram-paddle-config";

type BillingPeriod = "monthly" | "yearly";

const PRICING_DISPLAY_ORDER: SpunkramSubscriptionTierId[] = ["free", "ai_toolkit", "library"];

function tierDisplayPrice(tier: SpunkramSubscriptionTier, billing: BillingPeriod) {
  if (tier.id === "free") {
    return {
      amount: 0,
      billingNote: "No credit card required",
    };
  }
  if (billing === "monthly") {
    return {
      amount: tier.monthlyPrice,
      billingNote: "Billed monthly",
    };
  }
  return {
    amount: tier.yearlyPrice / 12,
    billingNote: "Billed yearly · ${amount} upfront",
    billingAmount: `$${Math.round(tier.yearlyPrice)}`,
  };
}

export function Pricing() {
  const { t } = useSpunkramLanguage();
  const router = useRouter();
  const { paddle, ready, subscribe } = usePaddle();
  const { user, openSignIn } = useAuth();
  const [billing, setBilling] = useState<BillingPeriod>("yearly");
  const [openingTier, setOpeningTier] = useState<SpunkramSubscriptionTierId | null>(null);
  const awaitingCheckout = useRef(false);
  const checkoutAttempt = useRef<string | null>(null);
  const libraryTier = spunkramSubscriptionTiers.find((t) => t.id === "library");

  useEffect(() => {
    return subscribe((event) => {
      if (!awaitingCheckout.current) return;
      if (event.name === "checkout.completed") {
        awaitingCheckout.current = false;
        checkoutAttempt.current = null;
        setOpeningTier(null);
        paddle?.Checkout.close();
        toast.success(t("Payment successful! Your subscription is activating…"));
        const transactionId = event.data?.transaction_id ?? null;
        void (async () => {
          if (transactionId) {
            try {
              await fetch("/api/me/subscriptions/claim", {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transactionId }),
              });
            } catch (err) {
              console.warn(
                "[spunkram-pricing] claim endpoint failed; relying on Paddle webhook:",
                err,
              );
            }
          }
          router.refresh();
        })();
      }
      if (event.name === "checkout.error") {
        awaitingCheckout.current = false;
        releaseCheckout();
        setOpeningTier(null);
        toast.error(t("Checkout error. Please try again."));
      }
      if (event.name === "checkout.closed") {
        awaitingCheckout.current = false;
        releaseCheckout();
        setOpeningTier(null);
      }
    });
  }, [subscribe, paddle, router, t]);

  function releaseCheckout() {
    const attemptId = checkoutAttempt.current;
    checkoutAttempt.current = null;
    if (!attemptId) return;
    void fetch("/api/spunkram/subscription-checkout", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId }),
    }).catch(() => {});
  }

  const openSubscribeCheckout = async (tierId: SpunkramSubscriptionTierId) => {
    if (openingTier !== null) return;
    if (!user) {
      openSignIn("signin");
      return;
    }

    if (!paddle) {
      toast.error(
        t(ready ? "Checkout is not ready yet. Please try again." : "Checkout is still loading…"),
      );
      return;
    }

    setOpeningTier(tierId);

    try {
      const attemptId = crypto.randomUUID();
      const response = await fetch("/api/spunkram/subscription-checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, tier: tierId, billing }),
      });
      const result = await response.json();
      if (result.error === "subscription_active") {
        setOpeningTier(null);
        toast.info("You already have a Spunkram subscription.", {
          action: { label: "Manage subscription", onClick: () => router.push("/profile/subscriptions?client=spunkram-cep") },
        });
        return;
      }
      if (result.error === "checkout_pending") {
        setOpeningTier(null);
        toast.info("A Spunkram checkout is already open. Finish or close it before trying again.");
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "Could not start checkout");
      const priceId = SPUNKRAM_SUBSCRIPTION_PRICE_IDS[tierId][billing];
      if (!result.transactionId && (!result.preview || !priceId?.startsWith("pri_"))) {
        throw new Error("Subscription checkout is not configured");
      }
      checkoutAttempt.current = result.transactionId ? attemptId : null;
      awaitingCheckout.current = true;
      paddle.Checkout.open({
        settings: {
          displayMode: "overlay",
          theme: "light",
          allowLogout: false,
        },
        customer: { email: user.email ?? undefined },
        ...(result.transactionId ? { transactionId: result.transactionId } : {
          items: [{ priceId, quantity: 1 }],
          customData: {
          buyer_id: String(user.id),
          kind: "spunkram_subscription",
          author_id: String(SPUNKRAM_AUTHOR_ID),
          billingPeriod: billing,
          tier: tierId,
          },
        }),
      });
    } catch (err) {
      awaitingCheckout.current = false;
      releaseCheckout();
      setOpeningTier(null);
      console.error("[spunkram-pricing] paddle checkout open failed:", err);
      toast.error(t("Could not open checkout. Please try again."));
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
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground"><SpunkramText>{"Choose your plan"}</SpunkramText></h2>
          <p className="mt-2 text-muted"><SpunkramText>{"Get the full Spunkram library or add AI Tools for image, video, and audio generation. Cancel anytime."}</SpunkramText></p>
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
            ><SpunkramText>{"Monthly"}</SpunkramText></button>
            <button
              type="button"
              onClick={() => setBilling("yearly")}
              className={`flex items-center gap-2 rounded-xl px-4 py-1.5 text-sm font-medium transition ${
                billing === "yearly"
                  ? "bg-brand-violet-soft text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22)]"
                  : "text-muted hover:text-foreground"
              }`}
            ><SpunkramText>{"Yearly"}</SpunkramText></button>
          </div>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3 max-w-6xl mx-auto">
          {PRICING_DISPLAY_ORDER.map((tierId) => {
            const tier = spunkramSubscriptionTiers.find((t) => t.id === tierId);
            if (!tier) return null;
            const { amount, billingNote, billingAmount } = tierDisplayPrice(tier, billing);
            const isOpening = openingTier === tier.id;
            const isFree = tier.id === "free";

            return (
              <div key={tier.id} className="relative flex h-full flex-col">
                {tier.highlight && (
                  <div className="pointer-events-none absolute left-1/2 top-0 z-[2] -translate-x-1/2 -translate-y-1/2">
                    <span className="inline-flex items-center rounded-full border border-brand-500/40 bg-brand-violet px-4 py-1.5 text-xs font-semibold tracking-wide text-white shadow-[0_8px_24px_-12px_rgb(110_60_255/0.75)]"><SpunkramText>{"Most Popular"}</SpunkramText></span>
                  </div>
                )}

                <div
                  className={`card relative isolate flex h-full flex-1 flex-col overflow-hidden rounded-[28px] p-8 sm:p-9 ${
                    tier.highlight
                      ? "!border-[3px] !border-brand-500 shadow-[0_0_52px_-10px_rgb(124_77_255/0.8)]"
                      : "border border-brand-500/25"
                  }`}
                >
                <div className="card-sheen-pricing pointer-events-none absolute inset-0 z-0" />

                <div className="relative z-[1] flex h-full flex-1 flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-xl font-semibold tracking-tight text-foreground">
                        <SpunkramText>{tier.name}</SpunkramText>
                      </h3>
                      <p className="mt-1 text-sm text-muted"><SpunkramText values={{ amount: billingAmount ?? "" }}>{billingNote}</SpunkramText></p>
                    </div>
                    {billing === "yearly" && tier.savings && (
                      <span className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-500 border border-brand-500/25">
                        {tier.savings}
                      </span>
                    )}
                  </div>

                  <div className="mt-7 flex items-end gap-2">
                    <span className="text-5xl font-semibold tracking-tight text-foreground tabular-nums leading-none">
                      {isFree ? t("Free") : `$${amount.toFixed(1)}`}
                    </span>
                    {!isFree && <span className="pb-1 text-sm text-subtle"><SpunkramText>{"/ month"}</SpunkramText></span>}
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
                        <span className="text-muted leading-snug"><SpunkramText>{f}</SpunkramText></span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8 pt-8 flex flex-1 flex-col justify-end">
                    {isFree ? (
                      <a
                        href="#download"
                        className="block w-full rounded-full border border-line bg-surface/50 px-6 py-3 text-center text-sm font-semibold text-foreground transition hover:bg-surface"
                      ><SpunkramText>{"Get Started Now"}</SpunkramText></a>
                    ) : (
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
                        <SpunkramText>{isOpening ? "Opening checkout…" : "Get Started Now"}</SpunkramText>
                      </button>
                    )}
                  </div>
                </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-subtle"><SpunkramText>{"Secure checkout · Prices in USD · Cancel anytime"}</SpunkramText></p>
      </div>
    </section>
  );
}
