"use client";

import { useMemo, useState } from "react";

type TabId = "all-in-one" | "one-click" | "drag-drop" | "customize" | "resize";

const tabs: Array<{
  id: TabId;
  label: string;
  title: string;
  description: string;
  videoSrc?: string;
  posterSrc?: string;
}> = [
  {
    id: "all-in-one",
    label: "All in one extension",
    title: "Everything you need in one panel",
    description:
      "Browse projects, preview results, and apply assets without leaving Premiere Pro or After Effects.",
    videoSrc: "/showcase-all-in-one.mp4",
    posterSrc: "/showcase-all-in-one.png",
  },
  {
    id: "one-click",
    label: "One click to install",
    title: "Install with a single click",
    description:
      "Download the extension and get it running in minutes. Updates are delivered automatically.",
    videoSrc: "/showcase-install.mp4",
    posterSrc: "/showcase-install.png",
  },
  {
    id: "drag-drop",
    label: "Drag and Drop to apply",
    title: "Apply assets with drag & drop",
    description:
      "Drag presets, transitions, and titles straight onto your timeline — no extra steps.",
    videoSrc: "/showcase-drag-drop.mp4",
    posterSrc: "/showcase-drag-drop.png",
  },
  {
    id: "customize",
    label: "Easy to customize",
    title: "Make it yours in seconds",
    description:
      "Swap colors, text, and timing quickly. Designed to be flexible for different styles and formats.",
    videoSrc: "/showcase-customize.mp4",
    posterSrc: "/showcase-customize.png",
  },
  {
    id: "resize",
    label: "Smart Resize",
    title: "Resize without rebuilding",
    description:
      "Switch between 16:9, 9:16 and 1:1 with smart scaling rules so layouts stay clean.",
    videoSrc: "/showcase-resize.mp4",
    posterSrc: "/showcase-resize.png",
  },
];

const footerNotes: Array<{
  title: string;
  description?: string;
  icon: React.ReactNode;
}> = [
  {
    title: "Fonts auto-installation",
    description: "Detects missing fonts and helps install them.",
    icon: (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 19V6a2 2 0 0 1 2-2h7" />
        <path d="M8 5h6" />
        <path d="M10 19h4" />
        <path d="M14 19c1.7-4 3.3-8 5-12" />
        <path d="M17 7h4" />
      </svg>
    ),
  },
  {
    title: "Regular Updates",
    description: "New packs and improvements shipped frequently.",
    icon: (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 0 1-15.36 6.36" />
        <path d="M3 12a9 9 0 0 1 15.36-6.36" />
        <path d="M21 3v6h-6" />
        <path d="M3 21v-6h6" />
      </svg>
    ),
  },
  {
    title: "Fast Support",
    description: "Quick help when something breaks or needs setup.",
    icon: (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        <path d="M8 9h8" />
        <path d="M8 13h6" />
      </svg>
    ),
  },
];

const installSteps = [
  "Download Spunkram Extension Installer",
  "Install The extension in one click",
  "Go to Windows > Extensions > Spunkram Extension",
];

export function Showcase() {
  const [active, setActive] = useState<TabId>("all-in-one");
  const tab = useMemo(() => tabs.find((t) => t.id === active)!, [active]);
  // Replace with your YouTube video id
  const howToUseYouTubeId = "dQw4w9WgXcQ";

  return (
    <section id="features" className="relative py-20">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <div className="mb-8">
          <div className="text-xs font-medium text-muted uppercase tracking-[0.2em]">
            Explore all features
          </div>
          <h2 className="mt-2 text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            Everything is built into the workflow
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Video tile (bento) */}
          <div className="lg:col-span-8">
            <div className="card relative isolate h-full overflow-hidden rounded-3xl border border-brand-500/25">
              <div
                className="card-sheen-pricing pointer-events-none absolute inset-0 z-0"
                aria-hidden="true"
              />
              <div className="relative z-[1] flex flex-col h-full overflow-hidden">
                <div className="relative w-full aspect-video bg-surface-2">
                  {/* If no files exist in /public, the gradient fallback still looks fine */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-700/35 via-page to-accent-600/25" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {tab.posterSrc && (
                    <img
                      src={tab.posterSrc}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                  )}
                  {tab.videoSrc && (
                    <video
                      className="absolute inset-0 w-full h-full object-cover"
                      src={tab.videoSrc}
                      muted
                      loop
                      playsInline
                      autoPlay
                    />
                  )}
                </div>
                <div className="p-5 sm:p-6">
                  <h3 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
                    {tab.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-muted">{tab.description}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Switchers tile (bento) */}
          <div className="lg:col-span-4">
            <div className="card relative isolate flex h-full flex-col overflow-hidden rounded-3xl border border-brand-500/25">
              <div
                className="card-sheen-pricing pointer-events-none absolute inset-0 z-0"
                aria-hidden="true"
              />
              <div className="relative z-[1] flex flex-1 flex-col p-3 sm:p-4 pointer-events-auto">
                <div className="p-3 sm:p-4">
                  <div className="text-xs font-medium text-muted">
                    Switch feature
                  </div>
                  <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                    Explore
                  </h2>
                </div>

                <div className="relative z-[2] flex-1 space-y-1.5 px-2 pb-3 sm:px-3 sm:pb-4 pointer-events-auto">
                {tabs.map((t) => {
                  const isActive = t.id === active;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActive(t.id)}
                      className={`w-full text-left rounded-2xl px-4 py-4 transition border ${
                        isActive
                          ? "bg-brand-500/10 border-brand-500/25"
                          : "bg-transparent border-line hover:border-line-strong hover:bg-surface-2"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="text-sm font-semibold text-foreground">
                          {t.label}
                        </div>
                        <svg
                          className={`w-4 h-4 shrink-0 transition-transform ${
                            isActive ? "translate-x-0.5" : ""
                          }`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" />
                        </svg>
                      </div>
                      <div className="mt-1 text-sm text-muted">{t.title}</div>
                    </button>
                  );
                })}
                </div>
              </div>
            </div>
          </div>

          {/* Static notes row (full width under the big block) */}
          <div className="lg:col-span-12">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {footerNotes.map((n) => (
                <div
                  key={n.title}
                  className="card relative overflow-hidden rounded-3xl border border-brand-500/25"
                >
                  <div
                    className="card-sheen-pricing pointer-events-none absolute inset-0 z-0"
                    aria-hidden="true"
                  />
                  <div className="relative z-[1] p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-line bg-surface-2 text-brand-500">
                      {n.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">
                        {n.title}
                      </div>
                      {n.description && (
                        <div className="mt-1.5 text-sm text-muted">
                          {n.description}
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* How to use — full-bleed divider, content aligned to site width */}
      <div className="mt-16 w-full sm:mt-20 md:mt-24">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-8 sm:pt-10 pb-8 sm:pb-10 md:pb-12">
          <div>
            <div className="text-xs font-medium text-muted uppercase tracking-[0.2em]">
              How to use
            </div>
            <h3 className="mt-2 text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              Watch the quick walkthrough
            </h3>
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 lg:items-center">
            <div className="lg:col-span-8 card relative overflow-hidden rounded-3xl border border-brand-500/25">
              <div
                className="card-sheen-pricing pointer-events-none absolute inset-0 z-0"
                aria-hidden="true"
              />
              <div className="relative z-[1] overflow-hidden">
                <div className="relative w-full aspect-video bg-surface-2">
                  <iframe
                    className="absolute inset-0 w-full h-full"
                    src={`https://www.youtube.com/embed/${howToUseYouTubeId}?rel=0&modestbranding=1`}
                    title="How to use Spunkram"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col gap-3 self-center w-full">
              <div className="pb-1">
                <div className="text-xs font-medium text-muted uppercase tracking-[0.2em]">
                  3 simple steps
                </div>
                <h4 className="mt-2 text-lg font-semibold text-foreground">
                  Install in minutes
                </h4>
              </div>
              {installSteps.map((step, i) => (
                <div
                  key={step}
                  className="card relative overflow-hidden rounded-2xl border border-brand-500/25"
                >
                  <div
                    className="card-sheen-pricing pointer-events-none absolute inset-0 z-0"
                    aria-hidden="true"
                  />
                  <div className="relative z-[1] p-4 sm:p-5 flex gap-3 sm:gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-sm font-semibold text-brand-500 border border-brand-500/25">
                    {i + 1}
                  </span>
                  <p className="text-sm text-muted leading-relaxed pt-1 min-w-0">
                    {i === 0 ? (
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="font-medium text-brand-500 underline decoration-brand-500/40 underline-offset-2 hover:text-brand-400 hover:decoration-brand-400/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                      >
                        {step}
                      </a>
                    ) : (
                      step
                    )}
                  </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

