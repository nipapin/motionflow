import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AI_TOOLS } from "@/lib/ai-tools";
import { cn } from "@/lib/utils";

export function AiToolsPromo() {
  return (
    <section className="mt-20 mb-12 sm:mt-28 lg:mt-36">
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        {/* Tool cards */}
        <div className="order-2 grid grid-cols-2 gap-3 sm:gap-4 lg:order-1 lg:pr-6 lg:pl-6 xl:pr-10 xl:pl-10">
          {AI_TOOLS.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group flex items-center gap-3 rounded-2xl border border-blue-500/30 bg-background/50 p-4 text-left smooth hover-lift hover:border-blue-500 hover:bg-background/70 sm:p-5"
            >
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-linear-to-br shadow-lg smooth group-hover:scale-110 sm:h-12 sm:w-12",
                  tool.previewFallback,
                )}
              >
                <tool.icon className="h-5 w-5 text-white sm:h-6 sm:w-6" strokeWidth={2.25} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-sm font-semibold text-foreground sm:text-base">{tool.label}</p>
                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  {tool.cardDescription}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Copy */}
        <div className="order-1 flex flex-col items-center text-center lg:order-2 lg:items-end lg:pr-6 lg:text-right xl:pr-10">
          <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-blue-500/30 bg-foreground/5 px-3.5 py-1.5 text-xs font-medium text-foreground sm:mb-6 sm:px-4 sm:py-2 sm:text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse sm:h-2 sm:w-2" />
            AI Tools
          </span>
          <h2 className="mb-4 text-3xl font-semibold tracking-tight text-foreground sm:mb-5 sm:text-4xl lg:text-5xl">
            Stay ahead of the curve
            <br />
            with powerful AI tools
          </h2>
          <p className="mb-8 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:mb-10 sm:text-lg">
            Generate videos, images, voiceovers, and vector graphics in seconds — all included in
            your plan, with a commercial license and no extra subscriptions needed.
          </p>
          <Link
            href="/ai-tools"
            className="inline-flex items-center gap-2 rounded-full bg-linear-to-r from-blue-600 to-blue-500 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 smooth hover-lift hover:from-blue-500 hover:to-blue-400 sm:px-9 sm:py-4 sm:text-base"
          >
            Explore AI Tools
            <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
