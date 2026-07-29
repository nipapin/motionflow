"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

export function CtaBanner() {
  return (
    <section className="mt-20 mb-12 sm:mt-28 lg:mt-36">
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/25 bg-gradient-to-br from-blue-950/60 via-[#0d1220] to-[#0a0e1a] px-8 py-12 shadow-[0_0_60px_-10px_rgba(59,130,246,0.15)] sm:px-10">
        {/* Subtle glow */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(59,130,246,0.12),transparent)]" />

        <div className="relative flex flex-col items-center gap-8 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <div>
            <h2 className="mb-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to create without limits?
            </h2>
            <p className="mx-auto max-w-md text-base text-white/55 sm:mx-0">
              Join thousands of editors and motion designers. Unlimited downloads, AI tools,
              and a commercial license — all in one subscription.
            </p>
          </div>

          <Link
            href="/pricing"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-blue-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 hover:shadow-blue-500/40"
          >
            <Sparkles className="h-4 w-4" />
            Get started today
          </Link>
        </div>
      </div>
    </section>
  );
}
