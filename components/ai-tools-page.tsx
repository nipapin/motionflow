"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Check, Clapperboard, ImageIcon, Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AiToolPreviewsMap } from "@/lib/ai-tools-previews";
import { AI_TOOLS, LABS_CTA_IMAGES, LABS_HERO_WORDS, type AiToolCategory, type AiToolItem } from "@/lib/ai-tools";
import { cn } from "@/lib/utils";

const HERO_FEATURES = ["Latest AI models", "Commercial use", "Always-evolving tools"] as const;

const CATEGORY_ICONS: Record<AiToolCategory, LucideIcon> = {
  Video: Clapperboard,
  Image: ImageIcon,
  Audio: Mic,
};

function CornerDots({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute h-16 w-16 opacity-40",
        "bg-[radial-gradient(circle,rgba(255,255,255,0.55)_1.5px,transparent_1.5px)]",
        "bg-size-[10px_10px]",
        className,
      )}
      aria-hidden
    />
  );
}

function ToolIconBadge({ tool }: { tool: AiToolItem }) {
  const Icon = tool.icon;
  return (
    <div className="absolute left-4 top-4 z-10 flex items-start gap-1.5">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-blue-600 to-blue-500 shadow-lg shadow-blue-500/30">
        <Icon className="h-5 w-5 text-white" strokeWidth={2.25} aria-hidden />
      </div>
      <Sparkles className="mt-1 h-4 w-4 text-white/90" aria-hidden />
      <Sparkles className="mt-3 h-3 w-3 text-white/50" aria-hidden />
    </div>
  );
}

function CategoryBadge({ category }: { category: AiToolCategory }) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-500/35 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400">
      <Icon className="h-3 w-3" aria-hidden />
      {category}
    </span>
  );
}

function ToolCardPreview({ tool, preview }: { tool: AiToolItem; preview: AiToolPreviewsMap[string] | undefined }) {
  const [videoFailed, setVideoFailed] = useState(false);
  const showVideo = Boolean(preview?.videoUrl) && !videoFailed;

  return (
    <div className="relative mb-4 aspect-video overflow-hidden rounded-3xl border border-blue-500/20 bg-black">
      <div
        className={cn("absolute inset-0 bg-linear-to-br", tool.previewFallback, showVideo ? "opacity-0" : "opacity-100")}
        aria-hidden={showVideo}
      />
      {showVideo && preview && (
        <video
          src={preview.videoUrl}
          poster={preview.posterUrl || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          onError={() => setVideoFailed(true)}
        />
      )}
      <div className="absolute inset-0 bg-linear-to-t from-black/50 via-transparent to-black/10" />
      <CornerDots className="right-3 top-3" />
      <CornerDots className="bottom-3 left-3 rotate-180" />
      <ToolIconBadge tool={tool} />
    </div>
  );
}

function ToolCard({ tool, preview }: { tool: AiToolItem; preview: AiToolPreviewsMap[string] | undefined }) {
  return (
    <Link
      href={tool.href}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <ToolCardPreview tool={tool} preview={preview} />

      <div className="mb-2 flex flex-wrap items-center gap-2 gap-y-1">
        <h2 className="text-xl font-bold tracking-tight text-foreground">{tool.displayName}</h2>
        <CategoryBadge category={tool.category} />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground group-hover:text-foreground/80 smooth">{tool.cardDescription}</p>
    </Link>
  );
}

const HEADLINE_SLOT_MS = 2800;
/** Line height of one word slot — must match each word row */
const HEADLINE_LINE_EM = 1.12;

function RotatingHeadline() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % LABS_HERO_WORDS.length);
    }, HEADLINE_SLOT_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <h1 className="relative inline-block text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl lg:leading-[1.1]">
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[2em] w-full min-w-[18rem] max-w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/20 blur-3xl sm:min-w-[22rem]"
        aria-hidden
      />
      <span className="relative z-10">
        Generate{" "}
        <span
          className="inline-block min-w-[7.5ch] align-bottom text-left sm:min-w-[8ch]"
          style={{ height: `${HEADLINE_LINE_EM}em` }}
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="inline-block overflow-hidden" style={{ height: `${HEADLINE_LINE_EM}em` }}>
            <span
              className="block transition-transform duration-[550ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ transform: `translateY(calc(-1 * ${index} * ${HEADLINE_LINE_EM}em))` }}
            >
              {LABS_HERO_WORDS.map((word) => (
                <span
                  key={word}
                  className="block bg-linear-to-r from-blue-400 via-blue-500 to-cyan-400 bg-clip-text text-transparent"
                  style={{
                    height: `${HEADLINE_LINE_EM}em`,
                    lineHeight: `${HEADLINE_LINE_EM}em`,
                  }}
                >
                  {word}
                </span>
              ))}
            </span>
          </span>
        </span>
      </span>
    </h1>
  );
}

type AiToolsPageProps = {
  previews: AiToolPreviewsMap;
};

export function AiToolsPage({ previews }: AiToolsPageProps) {
  return (
    <div className="mx-auto w-full max-w-[1280px] py-10">
      <header className="mx-auto mb-14 max-w-3xl text-center sm:mb-16 lg:mb-20">
        <RotatingHeadline />
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
          Explore Motion Flow&apos;s suite of powerful AI tools all in one place — no need for multiple subscriptions.
        </p>

        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {HERO_FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-foreground/80">
              <Check className="h-4 w-4 shrink-0 text-blue-400" strokeWidth={3} />
              {feature}
            </li>
          ))}
        </ul>
      </header>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-10">
        {AI_TOOLS.map((tool) => (
          <ToolCard key={tool.href} tool={tool} preview={previews[tool.href]} />
        ))}
      </div>

      <section className="mx-auto mt-20 max-w-3xl text-center sm:mt-28">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Not yet subscribed?</h2>
        <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground">
          Our all-in-one subscription gives you access to our AI tools, plus unlimited downloads of premium templates, stock music,
          sound effects, and more. Explore plans and find your perfect match for gen AI.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
          {LABS_CTA_IMAGES.map((img) => (
            <div key={img.src} className="relative aspect-4/3 overflow-hidden rounded-2xl border border-blue-500/20 sm:aspect-square">
              <Image src={img.src} alt={img.alt} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
            </div>
          ))}
        </div>

        <Button
          asChild
          className="mt-10 h-12 rounded-xl bg-linear-to-r from-blue-600 to-blue-500 px-8 text-base font-semibold text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-blue-400"
        >
          <Link href="/pricing">Subscribe to generate</Link>
        </Button>
      </section>
    </div>
  );
}
