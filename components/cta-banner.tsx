"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

export function CtaBanner() {
  return (
    <section className="mb-12">
      <div className="relative mx-auto max-w-2xl overflow-hidden rounded-2xl border border-blue-500/25 bg-gradient-to-br from-blue-950/60 via-[#0d1220] to-[#0a0e1a] px-8 py-12 text-center shadow-[0_0_60px_-10px_rgba(59,130,246,0.15)]">
        {/* Subtle glow */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(59,130,246,0.12),transparent)]" />

        <h2 className="relative mb-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Ready to create without limits?
        </h2>
        <p className="relative mx-auto mb-8 max-w-md text-sm text-white/55">
          Join thousands of editors and motion designers. Unlimited downloads, AI tools,
          and a commercial license — all in one subscription.
        </p>

        <Link
          href="/pricing"
          className="relative inline-flex items-center gap-2 rounded-full bg-blue-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 hover:shadow-blue-500/40"
        >
          <Sparkles className="h-4 w-4" />
          Get started today
        </Link>
      </div>
    </section>
  );
}
