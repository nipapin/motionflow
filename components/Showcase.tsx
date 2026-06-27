"use client";

import { useMemo, useState } from "react";
import { Lock } from "lucide-react";

type TabId = "all-in-one" | "one-click" | "drag-drop" | "customize" | "resize";
type AiToolsTabId = "auto-subtitles" | "chapters" | "voiceover";

type ShowcaseTab = {
  id: string;
  label: string;
  title: string;
  description: string;
  videoSrc?: string;
  posterSrc?: string;
  locked?: boolean;
};

const tabs: Array<ShowcaseTab & { id: TabId }> = [
  {
    id: "all-in-one",
    label: "All in one extension",
    title: "Everything you need in one panel",
    description:
      "Browse projects, preview results, and apply assets without leaving Premiere Pro or After Effects.",
    posterSrc: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=1280&q=85&fit=crop",
  },
  {
    id: "one-click",
    label: "One click to install",
    title: "Install with a single click",
    description:
      "Download the extension and get it running in minutes. Updates are delivered automatically.",
    posterSrc: "https://images.unsplash.com/photo-1555066931-4365d14431b9?w=1280&q=85&fit=crop",
  },
  {
    id: "drag-drop",
    label: "Drag and Drop to apply",
    title: "Apply assets with drag & drop",
    description:
      "Drag presets, transitions, and titles straight onto your timeline — no extra steps.",
    posterSrc: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=1280&q=85&fit=crop",
  },
  {
    id: "customize",
    label: "Easy to customize",
    title: "Make it yours in seconds",
    description:
      "Swap colors, text, and timing quickly. Designed to be flexible for different styles and formats.",
    posterSrc: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1280&q=85&fit=crop",
  },
  {
    id: "resize",
    label: "Smart Resize",
    title: "Resize without rebuilding",
    description:
      "Switch between 16:9, 9:16 and 1:1 with smart scaling rules so layouts stay clean.",
    posterSrc: "https://images.unsplash.com/photo-1536240478700-b869ad10325f?w=1280&q=85&fit=crop",
  },
];

const aiToolsTabs: Array<ShowcaseTab & { id: AiToolsTabId }> = [
  {
    id: "auto-subtitles",
    label: "Auto subtitles",
    title: "Captions in one click",
    description:
      "Generate accurate subtitles from speech and drop them onto your timeline automatically — no manual typing.",
    posterSrc: "https://images.unsplash.com/photo-1598387993441-a364f854cfbd?w=1280&q=85&fit=crop",
  },
  {
    id: "chapters",
    label: "Chapters",
    title: "Automatic chapter markers",
    description:
      "AI detects scene changes and inserts chapter points for easier navigation and exports.",
    posterSrc: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=1280&q=85&fit=crop",
    locked: true,
  },
  {
    id: "voiceover",
    label: "Voiceover",
    title: "Add voiceover in one click",
    description:
      "Generate a natural-sounding voiceover from your script and sync it to the timeline automatically.",
    posterSrc: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=1280&q=85&fit=crop",
    locked: true,
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

function scrollToPricing() {
  document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
}

function scrollToContact() {
  document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
}

function ShowcaseExplorerPanel({
  tabs: panelTabs,
  active,
  onActiveChange,
  switcherSubtitle = "Switch feature",
  switcherTitle = "Explore",
  footerAction,
  reversed = false,
}: {
  tabs: ShowcaseTab[];
  active: string;
  onActiveChange: (id: string) => void;
  switcherSubtitle?: string;
  switcherTitle?: string;
  footerAction?: { label: string; onClick: () => void };
  reversed?: boolean;
}) {
  const tab = useMemo(
    () => panelTabs.find((t) => t.id === active) ?? panelTabs[0],
    [active, panelTabs],
  );

  const mediaColumn = (
    <div className="lg:col-span-8">
      <div className="card relative isolate h-full overflow-hidden rounded-3xl border border-brand-500/25">
        <div
          className="card-sheen-pricing pointer-events-none absolute inset-0 z-0"
          aria-hidden="true"
        />
        <div className="relative z-[1] flex flex-col h-full overflow-hidden">
          <div className="relative w-full aspect-video bg-surface-2">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-700/35 via-page to-accent-600/25" />
            {tab.posterSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tab.posterSrc}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
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
  );

  const switcherColumn = (
    <div className="lg:col-span-4">
      <div className="card relative isolate flex h-full flex-col overflow-hidden rounded-3xl border border-brand-500/25">
        <div
          className="card-sheen-pricing pointer-events-none absolute inset-0 z-0"
          aria-hidden="true"
        />
        <div className="relative z-[1] flex flex-1 flex-col p-3 sm:p-4 pointer-events-auto">
          <div className="p-3 sm:p-4">
            <div className="text-xs font-medium text-muted">{switcherSubtitle}</div>
            <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              {switcherTitle}
            </h2>
          </div>

          <div className="relative z-[2] flex-1 space-y-1.5 px-2 pb-3 sm:px-3 sm:pb-4 pointer-events-auto">
            {panelTabs.map((t) => {
              const isActive = t.id === active;
              const isLocked = t.locked;

              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={isLocked}
                  onClick={() => {
                    if (!isLocked) onActiveChange(t.id);
                  }}
                  aria-disabled={isLocked}
                  className={`w-full text-left rounded-2xl px-4 py-4 transition border ${
                    isLocked
                      ? "cursor-not-allowed border-line/60 bg-surface/40 opacity-70"
                      : isActive
                        ? "bg-brand-500/10 border-brand-500/25"
                        : "bg-transparent border-line hover:border-line-strong hover:bg-surface-2"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {isLocked && (
                        <Lock
                          className="h-3.5 w-3.5 shrink-0 text-subtle"
                          aria-hidden="true"
                        />
                      )}
                      <div
                        className={`text-sm font-semibold truncate ${
                          isLocked ? "text-muted" : "text-foreground"
                        }`}
                      >
                        {t.label}
                      </div>
                    </div>
                    {isLocked ? (
                      <span className="shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                        Coming soon
                      </span>
                    ) : (
                      <svg
                        className={`w-4 h-4 shrink-0 transition-transform ${
                          isActive ? "translate-x-0.5 text-brand-500" : "text-muted"
                        }`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" />
                      </svg>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-muted line-clamp-2">{t.title}</div>
                </button>
              );
            })}
          </div>

          {footerAction && (
            <div className="relative z-[2] px-2 pb-3 pt-1 sm:px-3 sm:pb-4 mt-auto">
              <button
                type="button"
                onClick={footerAction.onClick}
                className="w-full rounded-full px-5 py-3 text-sm font-semibold bg-brand-violet hover:bg-brand-violet-hover text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22),0_10px_32px_-18px_rgb(110_60_255/0.55)] transition-[background-image,box-shadow] duration-200"
              >
                {footerAction.label}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
      {reversed ? (
        <>
          {switcherColumn}
          {mediaColumn}
        </>
      ) : (
        <>
          {mediaColumn}
          {switcherColumn}
        </>
      )}
    </div>
  );
}

export function Showcase() {
  const [active, setActive] = useState<TabId>("all-in-one");
  const [aiToolsActive, setAiToolsActive] = useState<AiToolsTabId>("auto-subtitles");
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

        <div className="space-y-4">
          <ShowcaseExplorerPanel
            tabs={tabs}
            active={active}
            onActiveChange={(id) => setActive(id as TabId)}
          />

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
                      <div className="text-sm font-semibold text-foreground">{n.title}</div>
                      {n.description && (
                        <div className="mt-1.5 text-sm text-muted">{n.description}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-10 sm:pt-12">
            <div className="mb-8 grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="hidden lg:block lg:col-span-4" aria-hidden="true" />
              <div className="lg:col-span-8 lg:text-right">
                <h3 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                  Edit faster with AI inside the extension
                </h3>
                <p className="mt-2 max-w-2xl text-sm text-muted lg:ml-auto">
                  Smart tools that live in the same panel — generate subtitles today,
                  with chapters and voiceover on the way.
                </p>
              </div>
            </div>

            <ShowcaseExplorerPanel
              tabs={aiToolsTabs}
              active={aiToolsActive}
              onActiveChange={(id) => setAiToolsActive(id as AiToolsTabId)}
              switcherSubtitle="Switch AI tool"
              switcherTitle="AI Tools"
              footerAction={{ label: "Get started now", onClick: scrollToPricing }}
              reversed
            />
          </div>

          {/* Stock Footages block */}
          <div className="pt-10 sm:pt-12">
            <div className="mb-8">
              <h3 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                Search Stock Footage
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-muted">
                Millions of royalty-free photos and videos — right inside your panel.
                No browser tabs, no import headaches.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* Media placeholder */}
              <div className="lg:col-span-8">
                <div className="card relative isolate h-full overflow-hidden rounded-3xl border border-brand-500/25">
                  <div className="card-sheen-pricing pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
                  <div className="relative z-[1] h-full">
                    <div className="relative w-full aspect-video bg-surface-2">
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-page/80 via-page/20 to-transparent z-[1]" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="https://images.unsplash.com/photo-1536240478700-b869ad10325f?w=1280&q=85&fit=crop"
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-5 sm:p-6">
                      <h4 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
                        Find the perfect shot without leaving your editor
                      </h4>
                      <p className="mt-1.5 text-sm text-muted">
                        Search, preview, and place footage directly on your timeline — no download folder, no drag-from-desktop.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Features list */}
              <div className="lg:col-span-4">
                <div className="card relative isolate flex h-full flex-col overflow-hidden rounded-3xl border border-brand-500/25">
                  <div className="card-sheen-pricing pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
                  <div className="relative z-[1] flex flex-col gap-2 p-5 sm:p-6 h-full">
                    {[
                      {
                        title: "Royalty-free photos",
                        desc: "Search millions of high-res images from Unsplash and Pexels.",
                        icon: (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="M21 15l-5-5L5 21" />
                          </svg>
                        ),
                      },
                      {
                        title: "Royalty-free video clips",
                        desc: "Browse cinematic stock video from Pexels — preview before you place.",
                        icon: (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect x="1" y="5" width="15" height="14" rx="2" />
                          </svg>
                        ),
                      },
                      {
                        title: "One-click to timeline",
                        desc: "Drop any asset straight onto your timeline or into the project bin.",
                        icon: (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 5v14M5 12l7 7 7-7" />
                          </svg>
                        ),
                      },
                      {
                        title: "Search inside the panel",
                        desc: "Everything happens in the Spunkram panel — no switching apps.",
                        icon: (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                          </svg>
                        ),
                      },
                    ].map((f) => (
                      <div key={f.title} className="flex items-start gap-3 rounded-2xl border border-line bg-surface/40 px-4 py-3.5">
                        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-500 border border-brand-500/20">
                          {f.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">{f.title}</div>
                          <div className="mt-0.5 text-xs text-muted leading-relaxed">{f.desc}</div>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={scrollToPricing}
                      className="mt-auto w-full rounded-full px-5 py-3 text-sm font-semibold bg-brand-violet hover:bg-brand-violet-hover text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22),0_10px_32px_-18px_rgb(110_60_255/0.55)] transition-[background-image,box-shadow] duration-200"
                    >
                      Get started now
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div id="how-to-use" className="mt-16 w-full scroll-mt-28 sm:mt-20 md:mt-24">
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
                <h4 className="mt-2 text-lg font-semibold text-foreground">Install in minutes</h4>
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

              <button
                type="button"
                onClick={scrollToContact}
                className="mt-1 w-full rounded-2xl border border-line bg-surface/40 px-4 py-3.5 text-sm text-muted transition hover:border-line-strong hover:bg-surface-2"
              >
                Need any help?{" "}
                <span className="font-semibold text-brand-500 underline decoration-brand-500/40 underline-offset-2">
                  Contact us
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
