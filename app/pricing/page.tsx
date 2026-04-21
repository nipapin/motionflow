"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePaddle } from "@/lib/paddle";
import { useAuth } from "@/components/auth-provider";

type PlanId = "creator" | "creator_ai";
type BillingPeriod = "monthly" | "yearly";

const PRICE_IDS: Record<PlanId, Record<BillingPeriod, string | undefined>> = {
  creator: {
    monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_MONTHLY,
    yearly: process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_YEARLY,
  },
  creator_ai: {
    monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_AI_MONTHLY,
    yearly: process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_AI_YEARLY,
  },
};

const creatorFeatures = [
  "Unlimited downloads",
  "After Effects templates",
  "Premiere Pro templates",
  "DaVinci Resolve templates",
  "Stock Music library",
  "Sound FX library",
  "Graphics assets",
  "Commercial license",
  "New releases every week",
  "24/7 Support",
];

const aiFeatures = ["AI Image Generation", "AI Video Generation", "Text to Speech", "Speech to Text"];

const ultimateFeatures = [...creatorFeatures, ...aiFeatures, "Priority support", "Early access to new tools"];

export default function PricingPage() {
  const router = useRouter();
  const { paddle, ready, subscribe } = usePaddle();
  const { user } = useAuth();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("yearly");
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);

  const monthlyPrice = 18;
  const yearlyPrice = monthlyPrice * 12 * 0.8;
  const yearlyMonthlyPrice = yearlyPrice / 12;

  const ultimateMonthly = 36;
  const ultimateYearly = ultimateMonthly * 12 * 0.8;
  const ultimateYearlyMonthly = ultimateYearly / 12;

  useEffect(() => {
    return subscribe((event) => {
      if (event.name === "checkout.completed") {
        toast.success("Payment successful! Activating your subscription…");
        router.push("/account?checkout=success");
      } else if (event.name === "checkout.error") {
        toast.error("Checkout error. Please try again.");
      }
    });
  }, [subscribe, router]);

  const openCheckout = (plan: PlanId) => {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent("/pricing")}`);
      return;
    }

    const priceId = PRICE_IDS[plan][billingPeriod];
    if (!priceId) {
      toast.error("This plan is not configured yet. Please try again later.");
      console.error(`[Paddle] Missing price id for plan=${plan} period=${billingPeriod}`);
      return;
    }

    if (!paddle) {
      toast.error(ready ? "Checkout is not ready yet. Please try again." : "Checkout is still loading…");
      return;
    }

    setPendingPlan(plan);

    try {
      paddle.Checkout.open({
        settings: {
          displayMode: "overlay",
          theme: "light",
          allowLogout: false,
        },
        items: [{ priceId, quantity: 1 }],
        customer: { email: user.email },
        customData: {
          userId: String(user.id),
          plan,
          billingPeriod,
        },
      });
    } catch (err) {
      console.error("[Paddle] Failed to open checkout:", err);
      toast.error("Could not open checkout. Please try again.");
    } finally {
      setPendingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background glow effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-5xl mx-auto px-6 py-12">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-12"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4 text-balance tracking-tight">Plans and Pricing</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto text-pretty leading-relaxed">
            Get unlimited access to all templates, music, and sound effects. Cancel anytime.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-2 mb-12">
          <div className="inline-flex items-center rounded-full border border-blue-500/20 p-1 bg-card/50 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setBillingPeriod("monthly")}
              className={cn(
                "px-5 py-2 rounded-full text-sm font-medium transition-all duration-300",
                billingPeriod === "monthly"
                  ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingPeriod("yearly")}
              className={cn(
                "px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2",
                billingPeriod === "yearly"
                  ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Yearly
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full",
                  billingPeriod === "yearly" ? "bg-white/20 text-white" : "bg-emerald-500/20 text-emerald-400",
                )}
              >
                -20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Creator Plan */}
          <div className="relative rounded-3xl border border-blue-500/20 bg-card/80 backdrop-blur-sm p-8 hover:border-blue-500/40 transition-all duration-300">
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-foreground mb-2">Creator</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">Full access to the template and audio library</p>
            </div>

            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-semibold text-foreground tracking-tight">
                  ${billingPeriod === "monthly" ? monthlyPrice : yearlyMonthlyPrice.toFixed(0)}
                </span>
                <span className="text-muted-foreground">/month</span>
              </div>
              {billingPeriod === "yearly" && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-muted-foreground line-through text-sm">${monthlyPrice * 12}/year</span>
                  <span className="text-foreground text-sm font-medium">${yearlyPrice.toFixed(0)}/year</span>
                </div>
              )}
            </div>

            <Button
              onClick={() => openCheckout("creator")}
              disabled={pendingPlan === "creator"}
              className="w-full mb-8 h-12 rounded-xl border border-blue-500/30 bg-blue-500/10 text-foreground hover:bg-blue-500/20 transition-all duration-300"
            >
              {pendingPlan === "creator" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Opening checkout…
                </>
              ) : (
                "Get Started"
              )}
            </Button>

            <ul className="space-y-3">
              {creatorFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-blue-400" />
                  </div>
                  <span className="text-foreground">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Creator + AI Plan */}
          <div className="relative rounded-3xl border-2 border-blue-500/50 bg-gradient-to-br from-card via-card to-blue-500/5 backdrop-blur-sm p-8 shadow-xl shadow-blue-500/10">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-gradient-to-r from-blue-600 to-blue-500 text-white text-xs font-semibold px-4 py-1.5 rounded-full whitespace-nowrap shadow-lg shadow-blue-500/30">
                Best Value
              </span>
            </div>

            <div className="mb-6">
              <h3 className="text-xl font-semibold text-foreground mb-2">{"Creator + AI"}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">Full library access plus all AI tools</p>
            </div>

            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-semibold text-foreground tracking-tight">
                  ${billingPeriod === "monthly" ? ultimateMonthly : ultimateYearlyMonthly.toFixed(0)}
                </span>
                <span className="text-muted-foreground">/month</span>
              </div>
              {billingPeriod === "yearly" && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-muted-foreground line-through text-sm">${ultimateMonthly * 12}/year</span>
                  <span className="text-foreground text-sm font-medium">${ultimateYearly.toFixed(0)}/year</span>
                </div>
              )}
            </div>

            <Button
              onClick={() => openCheckout("creator_ai")}
              disabled={pendingPlan === "creator_ai"}
              className="w-full mb-8 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-500/25 transition-all duration-300"
            >
              {pendingPlan === "creator_ai" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Opening checkout…
                </>
              ) : (
                "Get Started"
              )}
            </Button>

            <ul className="space-y-3">
              {ultimateFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-blue-400" />
                  </div>
                  <span className="text-foreground">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* FAQ or additional info */}
        <div className="mt-16 text-center">
          <p className="text-muted-foreground text-sm">All plans include a 7-day free trial. Cancel anytime.</p>
          <p className="text-muted-foreground text-sm mt-2">
            Questions?{" "}
            <Link href="/contact" className="text-blue-400 hover:text-blue-300 transition-colors">
              Contact us
            </Link>
          </p>
        </div>
      </div>

    </div>
  );
}
