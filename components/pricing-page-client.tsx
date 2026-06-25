"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, AlertCircle, Sparkles, Star, ShieldCheck, Zap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { usePaddle } from "@/lib/paddle";
import { useAuth } from "@/components/auth-provider";
import type { ActiveSubscriptionSummary, PricingBillingPeriod, PricingTier } from "@/lib/subscriptions";
import { AI_TOOLS } from "@/lib/ai-tools";

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

type PlanIncludeIcon = "check" | "sparkle";

type PlanIncludeItem = {
  icon: PlanIncludeIcon;
  bold: string;
  text?: string;
  bullets?: string[];
};

const CREATOR_INCLUDES: PlanIncludeItem[] = [
  {
    icon: "check",
    bold: "Unlimited downloads of our creative library:",
    bullets: [
      "After Effects, Premiere Pro & DaVinci Resolve templates",
      "Stock music & sound effects",
      "Image and video footages",
    ],
  },
  {
    icon: "sparkle",
    bold: "5 AI generations per month",
  },
  {
    icon: "check",
    bold: "Commercial license",
    text: " for all creative assets and AI generations",
  },
  {
    icon: "check",
    bold: "Fast support 27/7",
  },
];

/** Pricing copy: "Video Gen" → "Video Generation" (sidebar keeps short names). */
function planAiToolLabel(name: string): string {
  return name.replace(/\bGen\b/g, "Generation");
}

const CREATOR_AI_INCLUDES: PlanIncludeItem[] = [
  {
    icon: "check",
    bold: "Everything in Creator",
  },
  {
    icon: "sparkle",
    bold: "100 AI generations per month",
    bullets: AI_TOOLS.map((tool) => planAiToolLabel(tool.name)),
  },
];

function PlanIncludesList({ items }: { items: PlanIncludeItem[] }) {
  return (
    <div className="mt-8 border-t border-blue-500/15 pt-6">
      <p className="mb-4 text-sm font-medium text-foreground">Includes:</p>
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={`${item.bold}-${item.text ?? ""}`} className="flex gap-3">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              {item.icon === "sparkle" ? (
                <Sparkles className="h-4 w-4 text-blue-400" aria-hidden />
              ) : (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20">
                  <Check className="h-3 w-3 text-blue-400" aria-hidden />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-foreground">
                <span className="font-semibold">{item.bold}</span>
                {item.text ? <span className="font-normal">{item.text}</span> : null}
              </p>
              {item.bullets && item.bullets.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground marker:text-muted-foreground/50">
                  {item.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

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

function relationFor(current: ActiveSubscriptionSummary | null, cardTier: PlanId, cardBillingPeriod: BillingPeriod): CardRelation {
  if (!current) return "none";
  const sameTier = current.tier === cardTier;
  const samePeriod = current.billingPeriod === cardBillingPeriod;
  if (sameTier && samePeriod) return "current";
  if (current.scheduledChange?.tier === cardTier && current.scheduledChange?.billingPeriod === cardBillingPeriod) {
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

export function PricingPageClient({ currentUser, currentSubscription }: PricingPageClientProps) {
  const router = useRouter();
  const { paddle, ready, subscribe } = usePaddle();
  const { openSignIn } = useAuth();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(currentSubscription?.billingPeriod ?? "yearly");
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
      openSignIn("signin");
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
          buyer_id: String(currentUser.id),
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
      toast.success(data.effectiveAt ? `Plan will switch on ${formatDateDMY(data.effectiveAt)}.` : "Plan change scheduled.");
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
    includes: PlanIncludeItem[];
    isFeatured: boolean;
  }> = [
    {
      id: "creator",
      title: TIER_LABELS.creator,
      description: "Templates, music, sound effects, and starter AI access",
      monthly: monthlyPrice,
      yearly: yearlyPrice,
      yearlyMonthly: yearlyMonthlyPrice,
      includes: CREATOR_INCLUDES,
      isFeatured: false,
    },
    {
      id: "creator_ai",
      title: TIER_LABELS.creator_ai,
      description: "Everything in Creator, plus the full AI toolkit",
      monthly: ultimateMonthly,
      yearly: ultimateYearly,
      yearlyMonthly: ultimateYearlyMonthly,
      includes: CREATOR_AI_INCLUDES,
      isFeatured: true,
    },
  ];

  return (
    <div className="relative max-w-5xl mx-auto px-6 py-12">
      {/* Decorative background glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-[450px] h-[450px] bg-purple-500/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[100px]" />
      </div>

      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/5 px-4 py-1.5 mb-6 backdrop-blur-sm">
          <Sparkles className="h-3.5 w-3.5 text-blue-400" aria-hidden />
          <span className="text-xs font-medium text-foreground">One subscription. Templates, assets &amp; AI tools.</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4 text-balance tracking-tight">Plans and Pricing</h1>
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
                Your plan switches to <span className="font-medium">{scheduledTargetLabel}</span> on{" "}
                <span className="font-medium">{formatDateDMY(scheduledChange.effectiveAt)}</span>.
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
            {TIER_LABELS[currentSubscription.tier]} ({currentSubscription.billingPeriod === "yearly" ? "Annual" : "Monthly"})
          </span>
          {currentSubscription.currentPeriodEnd && !currentSubscription.cancelled && (
            <> · renews on {formatDateDMY(currentSubscription.currentPeriodEnd)}</>
          )}
          {currentSubscription.cancelled && currentSubscription.currentPeriodEnd && (
            <> · access ends {formatDateDMY(currentSubscription.currentPeriodEnd)}</>
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
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
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
              className={cn("relative rounded-3xl backdrop-blur-sm p-8 transition-all duration-300 scroll-mt-24", cardClasses)}
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

              <PlanIncludesList items={plan.includes} />
            </div>
          );
        })}

        {/* Enterprise card */}
        <div className="relative rounded-3xl border-2 border-blue-500/30 bg-gradient-to-br from-card via-card to-blue-500/5 shadow-xl shadow-blue-500/10 backdrop-blur-sm p-8 overflow-hidden transition-all duration-300">
          <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="relative">
            <div className="mb-6">
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">Enterprise</span>
              <h3 className="text-xl font-semibold text-foreground mb-2">Custom Plan</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Team seats, custom limits, dedicated support, and flexible licensing.
              </p>
            </div>

            <div className="mb-8">
              <p className="text-4xl font-semibold text-foreground tracking-tight">Let&apos;s talk</p>
            </div>

            <Link
              href="/contact"
              className="w-full mb-8 h-12 rounded-xl border border-blue-500/30 bg-blue-500/10 text-foreground text-sm font-medium hover:bg-blue-500/20 transition-all duration-300 inline-flex items-center justify-center"
            >
              Contact sales
            </Link>

            <div className="mt-8 border-t border-blue-500/15 pt-6">
              <p className="mb-4 text-sm font-medium text-foreground">Includes:</p>
              <ul className="space-y-4">
                {[
                  "Everything in Creator + AI",
                  "Custom AI generation limits",
                  "Team seats & shared workspace",
                  "Custom commercial licensing",
                  "Priority & dedicated support",
                  "Custom integrations on request",
                  "Invoicing & procurement support",
                ].map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20">
                      <Check className="h-3 w-3 text-blue-400" aria-hidden />
                    </div>
                    <span className="text-sm text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Guarantees strip */}
      <div className="mt-10 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Zap, title: "Instant access", text: "Start downloading the moment you subscribe." },
            { icon: ShieldCheck, title: "Perpetual license", text: "Keep everything you download — forever." },
            { icon: RefreshCw, title: "Cancel anytime", text: "No contracts. Manage your plan in a click." },
            { icon: Check, title: "Secure checkout", text: "Payments handled securely by Paddle." },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-blue-500/15 bg-card/60 backdrop-blur-sm p-5 text-center md:text-left transition-all duration-300 hover:border-blue-500/30"
            >
              <div className="mx-auto md:mx-0 mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
                <item.icon className="h-4.5 w-4.5 text-blue-400" aria-hidden />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">{item.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Testimonials */}
      <div className="mt-20 max-w-5xl mx-auto w-full">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-semibold text-foreground tracking-tight mb-2">What creators say</h2>
          <p className="text-muted-foreground text-sm">Real people, real projects.</p>
        </div>
        <div className="grid grid-cols-3 gap-5">
          {[
            {
              photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face",
              name: "Marcus Reid",
              role: "Senior Video Editor · Freelance",
              text: "I used to spend half my evening hunting for the right music track. Now I just open MotionFlow, grab something, and move on. The library is genuinely good — not filler.",
            },
            {
              photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face",
              name: "Alina Kowalski",
              role: "Creative Director · Vividframe Studio",
              text: "Creator + AI basically replaced two separate subscriptions for our team. The After Effects templates alone saved us probably 6 hours last month. Didn't expect to like it this much.",
            },
            {
              photo: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face",
              name: "Tom Brecker",
              role: "Colorist & Editor · Documentary Films",
              text: "The commercial license is what sold me. I don't think twice before using a sound effect in a client project now. That peace of mind is honestly worth the price alone.",
            },
          ].map((t) => (
            <div
              key={t.name}
              className="rounded-2xl border border-blue-500/15 bg-card/70 backdrop-blur-sm p-6 flex flex-col gap-4 hover:border-blue-500/30 transition-all duration-300"
            >
              <div className="flex gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                ))}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">&ldquo;{t.text}&rdquo;</p>
              <div className="flex items-center gap-3 pt-2 border-t border-blue-500/10">
                <img
                  src={t.photo}
                  alt={t.name}
                  width={40}
                  height={40}
                  className="rounded-full object-cover shrink-0"
                />
                <div>
                  <p className="text-sm font-semibold text-foreground leading-tight">{t.name}</p>
                  <p className="text-xs text-muted-foreground leading-tight mt-0.5">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-16 max-w-4xl mx-auto w-full">
        <h2 className="text-2xl font-semibold text-foreground text-center mb-2 tracking-tight">Frequently asked questions</h2>
        <p className="text-center text-muted-foreground text-sm mb-8 leading-relaxed">
          Everything about plans, downloads, AI generations, and licensing.
        </p>
        <Accordion type="single" collapsible className="rounded-2xl border border-blue-500/20 bg-card/50 px-1 sm:px-4">
          <AccordionItem value="q1" className="border-blue-500/10 px-3">
            <AccordionTrigger className="text-foreground text-base hover:no-underline">
              What's the difference between Creator and Creator + AI?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground/90">Creator</strong> gives you unlimited downloads from the full library — After Effects, Premiere Pro & DaVinci Resolve templates, stock music, sound effects, and footage — plus a commercial license and 5 AI generations per month to try the tools.{" "}
              <strong className="text-foreground/90">Creator + AI</strong> upgrades that to 100 AI generations per month across all six tools: Video Generation, Image Generation, Image Edit, SVG Generation, Text to Speech, and Speech to Text.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q2" className="border-blue-500/10 px-3">
            <AccordionTrigger className="text-foreground text-base hover:no-underline">
              How do AI generations work and what counts as one generation?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              Each time you produce an output — one image, one video clip, one voiceover, one transcription, one SVG, or one edited image — it uses one generation credit. Credits reset at the start of every billing period. Your current balance is always visible in the app. If you run out mid-month, you can purchase extra generation packs without upgrading your plan.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q3" className="border-blue-500/10 px-3">
            <AccordionTrigger className="text-foreground text-base hover:no-underline">
              Are downloads really unlimited? Are there any restrictions?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              Yes — while your subscription is active you can download as many items as you like from the catalog with no daily or monthly cap. You can also re-download anything from your profile at any time. The only restriction is that downloads are tied to your account: sharing credentials or downloading on behalf of other people violates the terms.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q4" className="border-blue-500/10 px-3">
            <AccordionTrigger className="text-foreground text-base hover:no-underline">
              What does the commercial license cover?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              The license covers everything you download or generate while subscribed: templates, music, sound effects, footage, and AI outputs. You can use them in client work, ads, YouTube videos, social media, films — personal or commercial, any number of projects. Licenses are{" "}
              <strong className="text-foreground/90">perpetual</strong>: they don't expire if you cancel. What you cannot do is redistribute the raw files, resell them on stock platforms, or share your account with others.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q5" className="border-blue-500/10 px-3">
            <AccordionTrigger className="text-foreground text-base hover:no-underline">
              What happens to my downloads if I cancel?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              You keep everything you've already downloaded — the license is perpetual. You won't be able to download new items or run new AI generations after your subscription ends, but all existing files and their licenses remain valid for use in your projects.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q6" className="border-blue-500/10 px-3">
            <AccordionTrigger className="text-foreground text-base hover:no-underline">
              Can I upgrade, downgrade, or switch billing periods?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              Upgrades take effect immediately — you pay only the prorated difference for the remaining days of your current period. Downgrades and billing-period switches are scheduled to kick in at the next renewal so you never lose time you've already paid for. You can manage all of this from the pricing page when you're logged in.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q7" className="border-blue-500/10 px-3 border-b-0">
            <AccordionTrigger className="text-foreground text-base hover:no-underline">
              Do you offer invoices, team plans, or custom licensing?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              Paddle (our payment processor) issues a receipt for every charge — you can find them in your account. For teams, agencies, or studios that need multiple seats, higher generation limits, or custom licensing terms, reach out via the contact form or at{" "}
              <a href="mailto:support@motionflow.pro" className="text-blue-400 hover:underline">support@motionflow.pro</a> and we'll work something out.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Closing CTA */}
      <div className="mt-20 max-w-4xl mx-auto w-full">
        <div className="relative overflow-hidden rounded-3xl border-2 border-blue-500/30 bg-gradient-to-br from-card via-card to-blue-500/5 shadow-xl shadow-blue-500/10 backdrop-blur-sm p-10 md:p-14 text-center">
          <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight mb-4 text-balance">
              Ready to create without limits?
            </h2>
            <p className="text-muted-foreground text-base max-w-xl mx-auto mb-8 text-pretty leading-relaxed">
              Join thousands of editors and motion designers. Unlimited downloads, AI tools, and a commercial license — all in one subscription.
            </p>
            <a
              href="#creator-ai"
              className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-blue-400 transition-all duration-300"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              Get started today
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
                    {TIER_LABELS[currentSubscription.tier]} ({currentSubscription.billingPeriod === "yearly" ? "Annual" : "Monthly"})
                  </span>{" "}
                  to{" "}
                  <span className="font-medium text-foreground">
                    {TIER_LABELS[downgradeTarget.tier]} ({downgradeTarget.billingPeriod === "yearly" ? "Annual" : "Monthly"})
                  </span>{" "}
                  on <span className="font-medium text-foreground">{formatDateDMY(currentSubscription.currentPeriodEnd)}</span>. You
                  keep your current plan until then. No charge today.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDowngradeTarget(null)} disabled={submittingDowngrade}>
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
                    {TIER_LABELS[currentSubscription.tier]} ({currentSubscription.billingPeriod === "yearly" ? "Annual" : "Monthly"})
                  </span>{" "}
                  to{" "}
                  <span className="font-medium text-foreground">
                    {TIER_LABELS[upgradeTarget.tier]} ({upgradeTarget.billingPeriod === "yearly" ? "Annual" : "Monthly"})
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
                  <span className="text-foreground">{formatMoney(upgradePreview.subtotalToday, upgradePreview.currencyCode)}</span>
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
            <Button onClick={submitUpgrade} disabled={submittingUpgrade || loadingUpgradePreview || !upgradePreview}>
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
      <Button onClick={onUpgrade} disabled={isPending} className={isFeatured ? baseFeatured : baseSecondary}>
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
