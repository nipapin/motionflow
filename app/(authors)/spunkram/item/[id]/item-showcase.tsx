"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ShowcaseCategorySummary,
  SpunkramShowcaseNode,
} from "@/lib/spunkram-showcase-catalog";
import { cn } from "@/lib/utils";

type Section = {
  breadcrumb: string[];
  key: string;
  files: SpunkramShowcaseNode[];
};

function collectSections(
  node: SpunkramShowcaseNode,
  path: string[],
): Section[] {
  const files = node.children.filter((c) => c.type !== "folder");
  const folders = node.children.filter((c) => c.type === "folder");
  const sections: Section[] = [];
  if (files.length > 0) {
    sections.push({ breadcrumb: path, key: node.href, files });
  }
  for (const sub of folders) {
    sections.push(...collectSections(sub, [...path, sub.name]));
  }
  return sections;
}

/**
 * The tiles scroll inside the pane, not the page, so the pane has to be the
 * observer root — with the default root every rootMargin is clipped away by it
 * and nothing gets a head start on loading.
 */
const PaneContext = createContext<HTMLElement | null>(null);

/** Only play what the visitor can actually see — packs hold thousands of clips. */
function useInViewport<T extends HTMLElement>() {
  const root = useContext(PaneContext);
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { root, rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [root]);

  return { ref, visible };
}

function TileSkeleton() {
  return (
    <div className="pointer-events-none absolute inset-0 animate-pulse bg-white/5" />
  );
}

function VideoPreview({ item }: { item: SpunkramShowcaseNode }) {
  const { ref, visible } = useInViewport<HTMLVideoElement>();
  const [ready, setReady] = useState(false);
  // Sticky source: clearing src on scroll-out makes the browser throw the clip
  // away and re-download it on every return trip.
  const [source, setSource] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (visible) setSource(item.media);
  }, [visible, item.media]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !source) return;
    if (!visible) {
      el.pause();
      return;
    }
    let cancelled = false;
    const play = () => {
      if (!cancelled) void el.play().catch(() => undefined);
    };
    play();
    // A play() issued while the buffer is still empty, or one interrupted by the
    // pause above, leaves the clip stopped — re-arm it once frames arrive.
    el.addEventListener("canplay", play);
    return () => {
      cancelled = true;
      el.removeEventListener("canplay", play);
    };
  }, [ref, visible, source]);

  return (
    <>
      <video
        ref={ref}
        src={source}
        poster={item.poster}
        onLoadedData={() => setReady(true)}
        onError={() => setReady(true)}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
          ready ? "opacity-100" : "opacity-0",
        )}
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
      />
      {ready ? null : <TileSkeleton />}
    </>
  );
}

function ImagePreview({ item }: { item: SpunkramShowcaseNode }) {
  const [ready, setReady] = useState(false);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.media}
        alt={item.name}
        loading="lazy"
        decoding="async"
        onLoad={() => setReady(true)}
        onError={() => setReady(true)}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
          ready ? "opacity-100" : "opacity-0",
        )}
      />
      {ready ? null : <TileSkeleton />}
    </>
  );
}

function AudioPreview({ item }: { item: SpunkramShowcaseNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-3">
      <audio src={item.media} controls preload="none" className="w-full" />
    </div>
  );
}

function PreviewCard({ item }: { item: SpunkramShowcaseNode }) {
  return (
    <figure>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black/40">
        {item.type === "video" ? (
          <VideoPreview item={item} />
        ) : item.type === "audio" ? (
          <AudioPreview item={item} />
        ) : (
          <ImagePreview item={item} />
        )}
      </div>
      <figcaption
        className="mt-2 truncate text-xs text-muted"
        title={item.name}
      >
        {item.name}
      </figcaption>
    </figure>
  );
}

function PreviewSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="aspect-video w-full animate-pulse rounded-xl bg-white/5"
        />
      ))}
    </div>
  );
}

const PAGE_SIZE = 24;

export function ItemShowcase({
  itemId,
  categories,
  initialCategory,
}: {
  itemId: number;
  categories: ShowcaseCategorySummary[];
  initialCategory: SpunkramShowcaseNode;
}) {
  const [selectedHref, setSelectedHref] = useState(initialCategory.href);
  const [loaded, setLoaded] = useState<Record<string, SpunkramShowcaseNode>>({
    [initialCategory.href]: initialCategory,
  });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // State, not a ref: the tiles observe the pane and need a render once it exists.
  const [pane, setPane] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const selected = loaded[selectedHref];

  const loadCategory = useCallback(
    async (href: string) => {
      setSelectedHref(href);
      setVisibleCount(PAGE_SIZE);
      setFailed(false);
      if (pane) pane.scrollTop = 0;
      if (loaded[href]) return;

      setLoading(true);
      try {
        const res = await fetch(
          `/api/spunkram/item/${itemId}/showcase?href=${encodeURIComponent(href)}`,
        );
        if (!res.ok) throw new Error("Failed");
        const data = (await res.json()) as { category: SpunkramShowcaseNode };
        setLoaded((prev) => ({ ...prev, [href]: data.category }));
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [itemId, loaded, pane],
  );

  const sections = useMemo(
    () => (selected ? collectSections(selected, []) : []),
    [selected],
  );

  /** Big packs run into hundreds of clips — reveal them a screenful at a time. */
  const { visibleSections, total } = useMemo(() => {
    let budget = visibleCount;
    const out: Section[] = [];
    for (const section of sections) {
      if (budget <= 0) break;
      out.push({ ...section, files: section.files.slice(0, budget) });
      budget -= section.files.length;
    }
    return {
      visibleSections: out,
      total: sections.reduce((sum, s) => sum + s.files.length, 0),
    };
  }, [sections, visibleCount]);

  const remaining = Math.max(0, total - visibleCount);

  /** Reveal the next batch as the pane reaches its end — no scrolling the page. */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || remaining === 0) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisibleCount((n) => n + PAGE_SIZE * 2);
      },
      { root: pane, rootMargin: "400px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [remaining, selectedHref, pane]);

  return (
    <section className="card mt-6 flex h-[calc(100dvh-5rem)] flex-col rounded-2xl p-5 sm:p-6 lg:h-[calc(100dvh-7rem)] lg:p-8">
      <h2 className="text-xl font-semibold text-foreground">
        What&apos;s inside
      </h2>

      <div className="mt-5 grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-6">
        <nav
          aria-label="Showcase categories"
          className="pane-scroll -mx-1 flex shrink-0 snap-x gap-2 overflow-x-auto px-1 pb-2 lg:-ml-1 lg:mr-0 lg:min-h-0 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:pr-3 lg:pb-0 lg:pl-1"
        >
          {categories.map((category) => {
            const active = category.href === selectedHref;
            return (
              <button
                key={category.href}
                type="button"
                onClick={() => void loadCategory(category.href)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex shrink-0 snap-start items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors lg:w-full lg:justify-between",
                  active
                    ? // bg-origin-border: without it the gradient tiles from the padding box
                      // and wraps a mismatched 1px band into the transparent border.
                      "border-transparent bg-brand-violet bg-origin-border font-medium text-white"
                    : "border-white/10 bg-white/5 text-muted hover:border-white/20 hover:text-foreground",
                )}
              >
                <span className="truncate">{category.name}</span>
                {category.counter ? (
                  <span
                    className={cn(
                      "text-xs",
                      active ? "text-white/70" : "text-muted",
                    )}
                  >
                    {category.counter}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <PaneContext.Provider value={pane}>
          <div
            ref={setPane}
            className="pane-scroll min-h-0 space-y-8 overflow-y-auto pr-3"
          >
            {loading ? <PreviewSkeleton /> : null}
            {failed && !loading ? (
              <p className="text-sm text-muted">
                Previews could not be loaded. Please try again.
              </p>
            ) : null}
            {!loading &&
              visibleSections.map((section) => (
                <div key={section.key}>
                  {section.breadcrumb.length > 0 ? (
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                      {section.breadcrumb.join(" / ")}
                    </h3>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {section.files.map((file) => (
                      <PreviewCard key={file.href} item={file} />
                    ))}
                  </div>
                </div>
              ))}
            {!loading && remaining > 0 ? (
              <div
                ref={sentinelRef}
                className="pb-2 text-center text-sm text-muted"
              >
                Loading {remaining} more…
              </div>
            ) : null}
          </div>
        </PaneContext.Provider>
      </div>
    </section>
  );
}
