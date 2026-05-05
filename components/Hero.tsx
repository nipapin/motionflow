"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

export function Hero() {
  return (
    <section id="top" className="relative pt-2 pb-10">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        {/* Video 16:9 — sidebar height is locked to video (absolute inset-y-0) */}
        <div className="relative w-full lg:pr-[calc(18rem+1rem)] xl:pr-[calc(20rem+1rem)]">
          <VideoTile />

          <aside className="mt-4 flex flex-col gap-4 lg:mt-0 lg:absolute lg:inset-y-0 lg:right-0 lg:w-72 xl:w-80 lg:min-h-0 lg:overflow-hidden">
            <DownloadTile className="lg:flex-1 lg:min-h-0" />
            <TechnicalDetailsTile />
            <ExploreLibraryButton />
          </aside>
        </div>
      </div>
    </section>
  );
}

/* ---------- TILES ---------- */

function VideoTile() {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlay = () => {
    setPlaying(true);
    requestAnimationFrame(() => {
      videoRef.current?.play().catch(() => {});
    });
  };

  return (
    <div className="card relative w-full aspect-video rounded-3xl overflow-hidden border border-brand-500/25">
      <div className="card-sheen-pricing pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
      {!playing && (
        <button
          type="button"
          onClick={handlePlay}
          aria-label="Play preview video"
          className="absolute inset-0 z-[2] w-full h-full group cursor-pointer"
        >
          {/* Fallback violet gradient behind image */}
          <div className="absolute inset-0 bg-gradient-to-br from-brand-700 via-page to-accent-600" />
          <img
            src="/hero-poster.png"
            alt="Spunkram preview"
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          {/* Light overlay for play control contrast */}
          <div className="absolute inset-0 bg-black/15" />

          {/* Play button */}
          <div className="absolute inset-0 grid place-items-center">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white text-black grid place-items-center shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] group-hover:scale-105 transition-transform">
              <svg className="w-8 h-8 translate-x-0.5" width={32} height={32} viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </button>
      )}

      {playing && (
        <video
          ref={videoRef}
          className="absolute inset-0 z-[2] w-full h-full object-cover bg-black"
          src="/hero.mp4"
          controls
          autoPlay
          playsInline
          poster="/hero-poster.png"
        />
      )}
    </div>
  );
}

function DownloadTile({ className }: { className?: string }) {
  return (
    <div
      id="download"
      className={cn("card relative overflow-hidden rounded-3xl border border-brand-500/25 flex flex-col min-h-0", className)}
    >
      <div className="card-sheen-pricing pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col p-4 sm:p-5">
        <div className="flex shrink-0 items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md bg-surface-2 text-muted border border-line">
            Free download
          </span>
          <span className="text-[11px] text-subtle">v2.1</span>
        </div>

        <h3 className="mt-3 text-base sm:text-lg font-semibold tracking-tight shrink-0">Spunkram Extension</h3>
        <p className="mt-1 text-xs sm:text-sm text-muted leading-relaxed shrink-0">
          Install once, then browse and apply projects inside Premiere Pro &amp; After Effects.
        </p>

        <div className="mt-auto grid shrink-0 grid-cols-2 gap-2 pt-6">
          <a
            href="#"
            className="flex items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-medium transition hover:border-line-strong hover:bg-surface-2"
          >
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
              <svg className="h-4 w-4" width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M0 3.449L9.75 2.1v9.451H0V3.449zm0 17.102L9.75 21.9v-9.451H0v8.102zm10.949 1.351L24 24V12.449H10.949V21.9zM10.949 2.1v9.451H24V0L10.949 2.1z" />
              </svg>
            </span>
            Windows
          </a>
          <a
            href="#"
            className="flex items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-medium transition hover:border-line-strong hover:bg-surface-2"
          >
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
              <svg className="h-4 w-4" width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
            </span>
            macOS
          </a>
        </div>
      </div>
    </div>
  );
}

function AppIconBadge({ label }: { label: string }) {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-violet text-[9px] font-bold leading-none tracking-tight text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.25)]"
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

function TechnicalDetailsTile() {
  return (
    <div className="card relative shrink-0 overflow-hidden rounded-2xl border border-brand-500/25">
      <div className="card-sheen-pricing pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
      <div className="relative z-[1] px-3.5 py-3 sm:px-4 sm:py-3.5">
        <h3 className="text-xs font-semibold tracking-tight text-foreground">Technical Details</h3>
        <div className="mt-2 divide-y divide-line">
          <div className="flex items-center gap-2 py-2">
            <AppIconBadge label="Pr" />
            <span className="min-w-0 text-xs text-muted">Adobe Premiere</span>
            <span className="ml-auto shrink-0 text-xs font-semibold text-foreground">CC 2023+</span>
          </div>
          <div className="flex items-center gap-2 py-2">
            <AppIconBadge label="Ae" />
            <span className="min-w-0 text-xs text-muted">Adobe After Effects</span>
            <span className="ml-auto shrink-0 text-xs font-semibold text-foreground">CC 2023+</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExploreLibraryButton() {
  return (
    <a
      href="#projects"
      className={cn(
        "shrink-0 flex items-center justify-center gap-2",
        "rounded-2xl px-5 py-3 sm:py-3.5",
        "text-sm font-semibold tracking-tight text-white",
        "border-l-0",
        "border border-white/10 bg-brand-violet-soft shadow-[0_4px_24px_-6px_rgb(45_20_90/0.55),inset_0_1px_0_0_rgb(255_255_255/0.18)] light:border-black/10 light:shadow-[0_4px_24px_-6px_rgb(45_20_90/0.35),inset_0_1px_0_0_rgb(0_0_0/0.08)]",
        "backdrop-blur-xl backdrop-saturate-150 transition-[background-image,box-shadow,border-color] duration-200",
        "hover:bg-brand-violet-soft-hover hover:shadow-[0_6px_28px_-6px_rgb(55_25_110/0.55),inset_0_1px_0_0_rgb(255_255_255/0.22)] light:hover:shadow-[0_6px_28px_-6px_rgb(55_25_110/0.4),inset_0_1px_0_0_rgb(0_0_0/0.1)]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
      )}
    >
      Explore Library
      <svg className="w-4 h-4 shrink-0 opacity-90" width={16} height={16} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
          clipRule="evenodd"
        />
      </svg>
    </a>
  );
}
