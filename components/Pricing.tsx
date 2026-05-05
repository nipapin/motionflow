"use client";

import { useState } from "react";
import { plans, projects } from "@/lib/data";

export function Pricing() {
  const [active, setActive] = useState<"monthly" | "yearly">("yearly");
  const activePlan = plans.find((p) => p.id === active) ?? plans[0];
  const yearlyPlan = plans.find((p) => p.id === "yearly");

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
          className="pointer-events-none h-full w-full blur-[64px] sm:blur-[88px]"
          style={{
            background:
              "radial-gradient(ellipse 62% 54% at 50% 50%, rgb(124 77 255 / 0.34) 0%, rgb(167 139 250 / 0.14) 44%, rgb(124 77 255 / 0.05) 58%, transparent 72%)",
          }}
        />
      </div>
      <div className="relative z-[1] max-w-6xl mx-auto px-5 sm:px-8 pointer-events-auto">
        <div className="text-center max-w-xl mx-auto">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-brand-500/10 text-brand-500 border border-brand-500/25">
            All projects · one subscription
          </span>
          <h2 className="mt-4 text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            Unlock the entire library
          </h2>
          <p className="mt-2 text-muted">
            Subscribe once and get instant access to every project — plus all
            future packs. Cancel anytime.
          </p>
        </div>

        <div className="relative z-[2] mt-8 flex justify-center pointer-events-auto">
          <div className="relative z-[2] inline-flex items-center gap-0.5 rounded-2xl p-0.5 card">
            <button
              type="button"
              onClick={() => setActive("monthly")}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium transition ${
                active === "monthly"
                  ? "bg-brand-violet-soft text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22)]"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setActive("yearly")}
              className={`flex items-center gap-2 rounded-xl px-4 py-1.5 text-sm font-medium transition ${
                active === "yearly"
                  ? "bg-brand-violet-soft text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22)]"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Yearly
              {yearlyPlan?.savings && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-white border border-white/10 light:border-black/10">
                  {yearlyPlan.savings}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="mt-12 max-w-md mx-auto">
          <div className="card relative isolate overflow-hidden rounded-[28px] border border-brand-500/25 p-8 sm:p-9">
            <div className="card-sheen-pricing pointer-events-none absolute inset-0 z-0" />

            <div className="relative z-[1]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold tracking-tight text-foreground">
                    {activePlan.name}
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    {activePlan.period === "month"
                      ? "Billed monthly"
                      : `Billed yearly · $${Math.round(activePlan.price)} upfront`}
                  </p>
                </div>
                {activePlan.savings && (
                  <span className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-500 border border-brand-500/25">
                    {activePlan.savings}
                  </span>
                )}
              </div>

              <div className="mt-7 flex items-end gap-2">
                {activePlan.id === "yearly" ? (
                  <>
                    <span className="text-5xl font-semibold tracking-tight text-foreground tabular-nums leading-none">
                      ${(activePlan.price / 12).toFixed(1)}
                    </span>
                    <span className="pb-1 text-sm text-subtle">/ month</span>
                  </>
                ) : (
                  <>
                    <span className="text-5xl font-semibold tracking-tight text-foreground tabular-nums leading-none">
                      ${activePlan.price.toFixed(1)}
                    </span>
                    <span className="pb-1 text-sm text-subtle">/ month</span>
                  </>
                )}
              </div>

              <p className="mt-3 text-sm text-muted leading-relaxed">
                {activePlan.description}
              </p>

              <div className="mt-7 border-t border-line/60" />

              <ul className="mt-7 space-y-3.5">
                {activePlan.features.map((f) => (
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
                  className="w-full rounded-full px-6 py-3 text-sm font-semibold bg-brand-violet hover:bg-brand-violet-hover text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22),0_14px_40px_-22px_rgb(110_60_255/0.65)] transition-[background-image,box-shadow] duration-200"
                >
                  Subscribe now
                </button>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-subtle">
          Secure checkout · Prices in USD · Cancel anytime
        </p>
      </div>
    </section>
  );
}
