"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { usePaddle } from "@/lib/paddle";
import type {
  ActiveSubscriptionSummary,
  PricingBillingPeriod,
  PricingTier,
} from "@/lib/subscriptions";

type PlanId = PricingTier;
type BillingPeriod = PricingBillingPeriod;

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

const TIER_RANK: Record<PlanId, number> = { creator: 1, creator_ai: 2 };

const TIER_LABELS: Record<PlanId, string> = {
  creator: "Creator",
  creator_ai: "Creator + AI",
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

interface PricingPageClientProps {
  currentUser: { id: number; email: string } | null;
  currentSubscription: ActiveSubscriptionSummary | null;
}

interface UpgradePreview {
  currencyCode: string;
  amountDueToday: number;
  creditApplied: number;
  taxToday: number;
  subtotalToday: number;
  nextBilledAmount: number;
  nextBilledAt: string | null;
  usedDays?: number;
  unusedDays?: number;
  periodDays?: number;
}

type CardRelation = "current" | "scheduled-target" | "upgrade" | "downgrade" | "none";

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function relationFor(
  current: ActiveSubscriptionSummary | null,
  cardTier: PlanId,
  cardBillingPeriod: BillingPeriod,
): CardRelation {
  if (!current) return "none";
  const sameTier = current.tier === cardTier;
  const samePeriod = current.billingPeriod === cardBillingPeriod;
  if (sameTier && samePeriod) return "current";
  if (
    current.scheduledChange?.tier === cardTier &&
    current.scheduledChange?.billingPeriod === cardBillingPeriod
  ) {
    return "scheduled-target";
  }
  // Tier first, then billing period.
  if (TIER_RANK[cardTier] > TIER_RANK[current.tier]) return "upgrade";
  if (TIER_RANK[cardTier] < TIER_RANK[current.tier]) return "downgrade";
  // Same tier — yearly is "above" monthly.
  if (current.billingPeriod === "monthly" && cardBillingPeriod === "yearly") return "upgrade";
  if (current.billingPeriod === "yearly" && cardBillingPeriod === "monthly") return "downgrade";
  return "none";
}

function formatDateDMY(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function PricingPageClient({
  currentUser,
  currentSubscription,
}: PricingPageClientProps) {
  const router = useRouter();
  const { paddle, ready, subscribe } = usePaddle();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(
    currentSubscription?.billingPeriod ?? "yearly",
  );
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);
  const [downgradeTarget, setDowngradeTarget] = useState<{
    tier: PlanId;
    billingPeriod: BillingPeriod;
  } | null>(null);
  const [submittingDowngrade, setSubmittingDowngrade] = useState(false);
  const [cancellingScheduledChange, setCancellingScheduledChange] = useState(false);

  const [upgradeTarget, setUpgradeTarget] = useState<{
    tier: PlanId;
    billingPeriod: BillingPeriod;
  } | null>(null);
  const [upgradePreview, setUpgradePreview] = useState<UpgradePreview | null>(null);
  const [loadingUpgradePreview, setLoadingUpgradePreview] = useState(false);
  const [submittingUpgrade, setSubmittingUpgrade] = useState(false);

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

  /**
   * For brand-new subscribers (no active sub): open the Paddle Checkout overlay
   * to capture a payment method and kick off a fresh subscription.
   * For existing subscribers we never come here for upgrades — we use
   * `openUpgradeModal` so the buyer pays only the prorated difference and the
   * same `subscription_id` gets updated in place.
   */
  const openCheckout = (plan: PlanId) => {
    if (!currentUser) {
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
        customer: { email: currentUser.email },
        customData: {
          userId: String(currentUser.id),
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

  const openUpgradeModal = async (plan: PlanId) => {
    setUpgradeTarget({ tier: plan, billingPeriod });
    setUpgradePreview(null);
    setLoadingUpgradePreview(true);
    try {
      const res = await fetch("/api/subscription/preview-upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: plan, billingPeriod }),
      });
      const data = (await res.json().catch(() => ({}))) as UpgradePreview & { error?: string; ok?: boolean };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load upgrade preview");
        setUpgradeTarget(null);
        return;
      }
      setUpgradePreview({
        currencyCode: data.currencyCode,
        amountDueToday: data.amountDueToday,
        creditApplied: data.creditApplied,
        taxToday: data.taxToday,
        subtotalToday: data.subtotalToday,
        nextBilledAmount: data.nextBilledAmount,
        nextBilledAt: data.nextBilledAt,
        usedDays: data.usedDays,
        unusedDays: data.unusedDays,
        periodDays: data.periodDays,
      });
    } catch (err) {
      console.error("[upgrade-preview] failed:", err);
      toast.error("Failed to load upgrade preview");
      setUpgradeTarget(null);
    } finally {
      setLoadingUpgradePreview(false);
    }
  };

  const submitUpgrade = async () => {
    if (!upgradeTarget) return;
    setSubmittingUpgrade(true);
    try {
      const res = await fetch("/api/subscription/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(upgradeTarget),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to upgrade plan");
        return;
      }
      toast.success("Plan upgraded. Updating your account…");
      setUpgradeTarget(null);
      setUpgradePreview(null);
      router.refresh();
    } catch (err) {
      console.error("[upgrade] failed:", err);
      toast.error("Failed to upgrade plan");
    } finally {
      setSubmittingUpgrade(false);
    }
  };

  const submitDowngrade = async () => {
    if (!downgradeTarget) return;
    setSubmittingDowngrade(true);
    try {
      const res = await fetch("/api/subscription/schedule-downgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(downgradeTarget),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; effectiveAt?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to schedule plan change");
        return;
      }
      toast.success(
        data.effectiveAt
          ? `Plan will switch on ${formatDateDMY(data.effectiveAt)}.`
          : "Plan change scheduled.",
      );
      setDowngradeTarget(null);
      router.refresh();
    } catch (err) {
      console.error("[downgrade] failed:", err);
      toast.error("Failed to schedule plan change");
    } finally {
      setSubmittingDowngrade(false);
    }
  };

  const cancelScheduledChange = async () => {
    setCancellingScheduledChange(true);
    try {
      const res = await fetch("/api/subscription/scheduled-change", {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to cancel scheduled change");
        return;
      }
      toast.success("Scheduled change cancelled.");
      router.refresh();
    } catch (err) {
      console.error("[cancel-scheduled-change] failed:", err);
      toast.error("Failed to cancel scheduled change");
    } finally {
      setCancellingScheduledChange(false);
    }
  };

  const scheduledChange = currentSubscription?.scheduledChange ?? null;
  const scheduledTargetLabel = useMemo(() => {
    if (!scheduledChange) return null;
    const tier = scheduledChange.tier;
    const period = scheduledChange.billingPeriod;
    if (tier && period) {
      return `${TIER_LABELS[tier]} (${period === "yearly" ? "Annual" : "Monthly"})`;
    }
    if (scheduledChange.action === "cancel") return "Cancellation";
    return scheduledChange.paddleProductName ?? "a different plan";
  }, [scheduledChange]);

  const planCards: Array<{
    id: PlanId;
    title: string;
    description: string;
    monthly: number;
    yearly: number;
    yearlyMonthly: number;
    features: string[];
    isFeatured: boolean;
  }> = [
    {
      id: "creator",
      title: TIER_LABELS.creator,
      description: "Full access to the template and audio library",
      monthly: monthlyPrice,
      yearly: yearlyPrice,
      yearlyMonthly: yearlyMonthlyPrice,
      features: creatorFeatures,
      isFeatured: false,
    },
    {
      id: "creator_ai",
      title: TIER_LABELS.creator_ai,
      description: "Full library access plus all AI tools",
      monthly: ultimateMonthly,
      yearly: ultimateYearly,
      yearlyMonthly: ultimateYearlyMonthly,
      features: ultimateFeatures,
      isFeatured: true,
    },
  ];

  return (
    <div className="relative max-w-5xl mx-auto px-6 py-12">
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4 text-balance tracking-tight">
          Plans and Pricing
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto text-pretty leading-relaxed">
          Get unlimited access to all templates, music, and sound effects. Cancel anytime.
        </p>
      </div>

      {/* Scheduled change banner */}
      {currentSubscription && scheduledChange && (
        <div className="mb-8 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 sm:p-5 max-w-3xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3 flex-1">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
              <div className="text-sm leading-relaxed">
                Your plan switches to <span className="font-medium">{scheduledTargetLabel}</span>{" "}
                on <span className="font-medium">{formatDateDMY(scheduledChange.effectiveAt)}</span>.
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={cancelScheduledChange}
              disabled={cancellingScheduledChange}
              className="shrink-0"
            >
              {cancellingScheduledChange ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  Cancelling…
                </>
              ) : (
                "Cancel change"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Current plan summary */}
      {currentSubscription && !scheduledChange && (
        <p className="mb-8 text-center text-sm text-muted-foreground">
          You are on{" "}
          <span className="text-foreground font-medium">
            {TIER_LABELS[currentSubscription.tier]} (
            {currentSubscription.billingPeriod === "yearly" ? "Annual" : "Monthly"})
          </span>
          {currentSubscription.currentPeriodEnd && !currentSubscription.cancelled && (
            <>
              {" "}
              · renews on {formatDateDMY(currentSubscription.currentPeriodEnd)}
            </>
          )}
          {currentSubscription.cancelled && currentSubscription.currentPeriodEnd && (
            <>
              {" "}
              · access ends {formatDateDMY(currentSubscription.currentPeriodEnd)}
            </>
          )}
        </p>
      )}

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
        {planCards.map((plan) => {
          const relation = relationFor(currentSubscription, plan.id, billingPeriod);
          const isCurrent = relation === "current";
          const isScheduledTarget = relation === "scheduled-target";

          const cardClasses = plan.isFeatured
            ? "border-2 border-blue-500/50 bg-gradient-to-br from-card via-card to-blue-500/5 shadow-xl shadow-blue-500/10"
            : "border border-blue-500/20 bg-card/80 hover:border-blue-500/40";

          return (
            <div
              key={plan.id}
              id={plan.id === "creator_ai" ? "creator-ai" : undefined}
              className={cn(
                "relative rounded-3xl backdrop-blur-sm p-8 transition-all duration-300 scroll-mt-24",
                cardClasses,
              )}
            >
              {plan.isFeatured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-blue-600 to-blue-500 text-white text-xs font-semibold px-4 py-1.5 rounded-full whitespace-nowrap shadow-lg shadow-blue-500/30">
                    Best Value
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-semibold text-foreground mb-2">{plan.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{plan.description}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-semibold text-foreground tracking-tight">
                    ${billingPeriod === "monthly" ? plan.monthly : plan.yearlyMonthly.toFixed(0)}
                  </span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                {billingPeriod === "yearly" && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-muted-foreground line-through text-sm">${plan.monthly * 12}/year</span>
                    <span className="text-foreground text-sm font-medium">${plan.yearly.toFixed(0)}/year</span>
                  </div>
                )}
              </div>

              <PlanActionButton
                plan={plan.id}
                billingPeriod={billingPeriod}
                relation={relation}
                isFeatured={plan.isFeatured}
                isPending={pendingPlan === plan.id}
                isLoggedIn={!!currentUser}
                hasScheduledChange={!!scheduledChange}
                scheduledEffectiveAt={scheduledChange?.effectiveAt ?? null}
                onUpgrade={() => {
                  // Existing subscriber → prorated upgrade via Paddle API.
                  // New subscriber → fresh Paddle Checkout overlay.
                  if (currentSubscription) {
                    void openUpgradeModal(plan.id);
                  } else {
                    openCheckout(plan.id);
                  }
                }}
                onScheduleDowngrade={() => setDowngradeTarget({ tier: plan.id, billingPeriod })}
                isCurrent={isCurrent}
                isScheduledTarget={isScheduledTarget}
              />

              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-blue-400" />
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-16 max-w-4xl mx-auto w-full">
        <h2 className="text-2xl font-semibold text-foreground text-center mb-2 tracking-tight">
          Pricing FAQ
        </h2>
        <p className="text-center text-muted-foreground text-sm mb-8 leading-relaxed">
          Answers about plans, billing, and what happens after you subscribe.
        </p>
        <Accordion
          type="single"
          collapsible
          className="rounded-2xl border border-blue-500/20 bg-card/50 px-1 sm:px-4"
        >
          <AccordionItem value="q1" className="border-blue-500/10 px-3">
            <AccordionTrigger className="text-foreground text-base hover:no-underline">
              What is the difference between Creator and Creator + AI?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground/90">Creator</strong> includes the full template and asset library
              with unlimited marketplace downloads.{" "}
              <strong className="text-foreground/90">Creator + AI</strong> adds image and video generation, text to
              speech, and speech to text on top of the same library and commercial license.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q2" className="border-blue-500/10 px-3">
            <AccordionTrigger className="text-foreground text-base hover:no-underline">
              Can I change or cancel my plan?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              You can upgrade or schedule a plan change from this page when you are logged in. Cancel anytime from your
              account; you keep access until the end of the current billing period. See our refund policy for details on
              eligibility.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q3" className="border-blue-500/10 px-3">
            <AccordionTrigger className="text-foreground text-base hover:no-underline">
              Is yearly billing really cheaper?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              Yes — the yearly option is billed once per year at a discounted rate compared to twelve monthly payments.
              The page shows the effective monthly cost for easy comparison.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q4" className="border-blue-500/10 px-3">
            <AccordionTrigger className="text-foreground text-base hover:no-underline">
              How do downloads and licensing work?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              While you have an active subscription you can download items from the catalog and use them under our
              license in personal and commercial work. You can re-download from your profile, and a separate purchase
              code applies to one-time store purchases. See the License page for full terms.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q5" className="border-blue-500/10 px-3">
            <AccordionTrigger className="text-foreground text-base hover:no-underline">
              How are AI generation limits applied?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              Creator + AI includes a monthly allowance for AI tools. Usage resets each billing period; the exact
              balance appears in the app. If you need a higher cap for a team, contact us for custom options.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q6" className="border-blue-500/10 px-3 border-b-0">
            <AccordionTrigger className="text-foreground text-base hover:no-underline">
              Can I get an invoice or custom / team pricing?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              Paddle provides receipts for your payments. For teams, agencies, or custom licensing, use the contact
              form or email support — we can suggest a plan that matches your workflow.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Custom plan / enterprise CTA */}
      <div className="mt-6 max-w-4xl mx-auto">
        <div className="relative rounded-3xl border border-blue-500/20 bg-card/60 backdrop-blur-sm p-8 md:p-10 text-center">
          <h3 className="text-2xl font-semibold text-foreground mb-3 tracking-tight">Need a custom plan?</h3>
          <p className="text-muted-foreground text-base leading-relaxed max-w-xl mx-auto">
            Working with a team, agency or studio? Looking for extended licensing, higher AI usage limits, custom
            integrations or volume pricing? Tell us about your workflow — we&apos;ll put together a plan that fits.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-medium shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-blue-400 transition-all duration-300"
            >
              Contact sales
            </Link>
            <a
              href="mailto:support@motionflow.pro"
              className="inline-flex items-center justify-center h-11 px-6 rounded-xl border border-blue-500/30 bg-blue-500/5 text-foreground text-sm font-medium hover:bg-blue-500/10 transition-all duration-300"
            >
              support@motionflow.pro
            </a>
          </div>
        </div>
      </div>

      {/* Downgrade confirmation modal */}
      <Dialog
        open={!!downgradeTarget}
        onOpenChange={(open) => {
          if (!open && !submittingDowngrade) setDowngradeTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule plan change</DialogTitle>
            <DialogDescription>
              {downgradeTarget && currentSubscription && (
                <>
                  Your subscription will switch from{" "}
                  <span className="font-medium text-foreground">
                    {TIER_LABELS[currentSubscription.tier]} (
                    {currentSubscription.billingPeriod === "yearly" ? "Annual" : "Monthly"})
                  </span>{" "}
                  to{" "}
                  <span className="font-medium text-foreground">
                    {TIER_LABELS[downgradeTarget.tier]} (
                    {downgradeTarget.billingPeriod === "yearly" ? "Annual" : "Monthly"})
                  </span>{" "}
                  on{" "}
                  <span className="font-medium text-foreground">
                    {formatDateDMY(currentSubscription.currentPeriodEnd)}
                  </span>
                  . You keep your current plan until then. No charge today.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setDowngradeTarget(null)}
              disabled={submittingDowngrade}
            >
              Cancel
            </Button>
            <Button onClick={submitDowngrade} disabled={submittingDowngrade}>
              {submittingDowngrade ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scheduling…
                </>
              ) : (
                "Confirm change"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade confirmation modal with prorated charge breakdown */}
      <Dialog
        open={!!upgradeTarget}
        onOpenChange={(open) => {
          if (!open && !submittingUpgrade) {
            setUpgradeTarget(null);
            setUpgradePreview(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade to {upgradeTarget ? TIER_LABELS[upgradeTarget.tier] : ""}</DialogTitle>
            <DialogDescription>
              {upgradeTarget && currentSubscription && (
                <>
                  Switching from{" "}
                  <span className="font-medium text-foreground">
                    {TIER_LABELS[currentSubscription.tier]} (
                    {currentSubscription.billingPeriod === "yearly" ? "Annual" : "Monthly"})
                  </span>{" "}
                  to{" "}
                  <span className="font-medium text-foreground">
                    {TIER_LABELS[upgradeTarget.tier]} (
                    {upgradeTarget.billingPeriod === "yearly" ? "Annual" : "Monthly"})
                  </span>
                  . You&apos;ll be charged the prorated difference today.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {loadingUpgradePreview && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Calculating charge…
            </div>
          )}

          {!loadingUpgradePreview && upgradePreview && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm space-y-2">
              {upgradePreview.subtotalToday > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">New plan</span>
                  <span className="text-foreground">
                    {formatMoney(upgradePreview.subtotalToday, upgradePreview.currencyCode)}
                  </span>
                </div>
              )}
              {upgradePreview.creditApplied > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Credit for current plan
                    {typeof upgradePreview.unusedDays === "number" && upgradePreview.periodDays
                      ? ` (${upgradePreview.unusedDays} of ${upgradePreview.periodDays} days remaining)`
                      : ""}
                  </span>
                  <span className="text-emerald-500">
                    -{formatMoney(Math.abs(upgradePreview.creditApplied), upgradePreview.currencyCode)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-2 mt-2">
                <span className="font-medium text-foreground">Due today</span>
                <span className="font-semibold text-foreground text-base">
                  {formatMoney(upgradePreview.amountDueToday, upgradePreview.currencyCode)}
                </span>
              </div>
              {upgradePreview.nextBilledAt && upgradePreview.nextBilledAmount > 0 && (
                <p className="text-xs text-muted-foreground pt-1">
                  From {formatDateDMY(upgradePreview.nextBilledAt)} you&apos;ll be charged{" "}
                  {formatMoney(upgradePreview.nextBilledAmount, upgradePreview.currencyCode)} per period.
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setUpgradeTarget(null);
                setUpgradePreview(null);
              }}
              disabled={submittingUpgrade}
            >
              Cancel
            </Button>
            <Button
              onClick={submitUpgrade}
              disabled={submittingUpgrade || loadingUpgradePreview || !upgradePreview}
            >
              {submittingUpgrade ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing…
                </>
              ) : upgradePreview ? (
                `Pay ${formatMoney(upgradePreview.amountDueToday, upgradePreview.currencyCode)}`
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface PlanActionButtonProps {
  plan: PlanId;
  billingPeriod: BillingPeriod;
  relation: CardRelation;
  isFeatured: boolean;
  isPending: boolean;
  isLoggedIn: boolean;
  hasScheduledChange: boolean;
  scheduledEffectiveAt: string | null;
  isCurrent: boolean;
  isScheduledTarget: boolean;
  onUpgrade: () => void;
  onScheduleDowngrade: () => void;
}

function PlanActionButton({
  relation,
  isFeatured,
  isPending,
  isLoggedIn,
  scheduledEffectiveAt,
  isCurrent,
  isScheduledTarget,
  onUpgrade,
  onScheduleDowngrade,
}: PlanActionButtonProps) {
  const baseFeatured =
    "w-full mb-8 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-500/25 transition-all duration-300";
  const baseSecondary =
    "w-full mb-8 h-12 rounded-xl border border-blue-500/30 bg-blue-500/10 text-foreground hover:bg-blue-500/20 transition-all duration-300";
  const baseDisabled = "w-full mb-8 h-12 rounded-xl border border-border bg-muted/40 text-muted-foreground cursor-not-allowed";

  if (!isLoggedIn) {
    // Default behaviour for logged-out visitors: any click → checkout/login.
    return (
      <Button
        onClick={onUpgrade}
        disabled={isPending}
        className={isFeatured ? baseFeatured : baseSecondary}
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Opening checkout…
          </>
        ) : (
          "Get Started"
        )}
      </Button>
    );
  }

  if (isCurrent) {
    return (
      <Button disabled className={baseDisabled}>
        Current plan
      </Button>
    );
  }

  if (isScheduledTarget && scheduledEffectiveAt) {
    return (
      <Button disabled className={baseDisabled}>
        Switching on {formatDateDMY(scheduledEffectiveAt)}
      </Button>
    );
  }

  if (relation === "upgrade") {
    return (
      <Button
        onClick={onUpgrade}
        disabled={isPending}
        className={isFeatured ? baseFeatured : baseSecondary}
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Opening checkout…
          </>
        ) : (
          "Upgrade"
        )}
      </Button>
    );
  }

  if (relation === "downgrade") {
    return (
      <Button onClick={onScheduleDowngrade} className={baseSecondary}>
        Select
      </Button>
    );
  }

  return (
    <Button onClick={onUpgrade} disabled={isPending} className={isFeatured ? baseFeatured : baseSecondary}>
      {isPending ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Opening checkout…
        </>
      ) : (
        "Get Started"
      )}
    </Button>
  );
}
