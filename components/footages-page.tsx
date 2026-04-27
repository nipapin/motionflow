"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";
import { ExternalLink, Heart, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MasonryGrid } from "@/components/masonry-grid";
import type { FootagePhoto, FootageSearchResult } from "@/app/api/stock/unsplash/route";
import type { FootagePhotoDetail } from "@/app/api/stock/unsplash/[id]/route";
import { cn } from "@/lib/utils";

const ORIENTATION_OPTIONS = [
  { value: "any", label: "Any orientation" },
  { value: "landscape", label: "Landscape" },
  { value: "portrait", label: "Portrait" },
  { value: "squarish", label: "Square" },
] as const;

type OrientationValue = (typeof ORIENTATION_OPTIONS)[number]["value"];

const PER_PAGE = 24;
const UTM = "?utm_source=motionflow&utm_medium=referral";

function withUtm(url: string): string {
  if (!url) return url;
  return url.includes("?") ? `${url}&utm_source=motionflow&utm_medium=referral` : `${url}${UTM}`;
}

export function FootagesPage() {
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [orientation, setOrientation] = useState<OrientationValue>("any");

  const [photos, setPhotos] = useState<FootagePhoto[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FootagePhoto | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);

  const fetchPhotos = useCallback(
    async (opts: { query: string; orientation: OrientationValue; page: number; append: boolean }) => {
      const { query, orientation: o, page: p, append } = opts;
      const requestId = ++requestIdRef.current;
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("page", String(p));
        params.set("perPage", String(PER_PAGE));
        if (query.trim()) params.set("query", query.trim());
        if (o !== "any") params.set("orientation", o);

        const res = await fetch(`/api/stock/unsplash?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const data = (await res.json()) as FootageSearchResult;

        if (requestId !== requestIdRef.current) return;

        setPhotos((prev) => {
          if (!append) return data.results;
          const seen = new Set(prev.map((p) => p.id));
          const merged = [...prev];
          for (const item of data.results) {
            if (!seen.has(item.id)) merged.push(item);
          }
          return merged;
        });
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setPage(data.page);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        console.error("[footages] fetch failed", err);
        setError("Could not load footages. Please try again.");
        if (!append) setPhotos([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void fetchPhotos({ query: activeQuery, orientation, page: 1, append: false });
  }, [fetchPhotos, activeQuery, orientation]);

  const hasMore = useMemo(() => {
    if (totalPages > 0) return page < totalPages;
    return photos.length >= page * PER_PAGE;
  }, [page, totalPages, photos.length]);

  const loadMore = useCallback(() => {
    if (isLoading || isLoadingMore || !hasMore) return;
    void fetchPhotos({
      query: activeQuery,
      orientation,
      page: page + 1,
      append: true,
    });
  }, [isLoading, isLoadingMore, hasMore, activeQuery, orientation, page, fetchPhotos]);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setActiveQuery(searchInput);
  };

  const clearSearch = () => {
    setSearchInput("");
    setActiveQuery("");
  };

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl lg:text-4xl font-semibold text-foreground mb-3 tracking-tight">
          Footages
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl">
          Free, royalty-free photos powered by{" "}
          <a
            href={`https://unsplash.com${UTM}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Unsplash
          </a>
          . Search by keyword and filter by orientation.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search Unsplash photos…"
            className="h-11 rounded-full border-blue-500/35 bg-linear-to-r from-blue-500/8 to-blue-900/12 pl-10 pr-10 focus-visible:border-blue-500/70"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Select
          value={orientation}
          onValueChange={(value) => setOrientation(value as OrientationValue)}
        >
          <SelectTrigger className="h-11 w-full rounded-full border-blue-500/35 bg-linear-to-r from-blue-500/8 to-blue-900/12 px-4 sm:w-[200px]">
            <SelectValue placeholder="Orientation" />
          </SelectTrigger>
          <SelectContent>
            {ORIENTATION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="submit"
          className="h-11 rounded-full bg-linear-to-r from-blue-600 to-blue-500 px-6 text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-blue-400"
        >
          Search
        </Button>
      </form>

      {activeQuery && !isLoading && (
        <p className="mb-4 text-sm text-muted-foreground">
          {total > 0 ? (
            <>
              Showing results for <span className="text-foreground">&ldquo;{activeQuery}&rdquo;</span>
              {" • "}
              <span>{total.toLocaleString()} photos</span>
            </>
          ) : (
            <>No photos found for &ldquo;{activeQuery}&rdquo;.</>
          )}
        </p>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading && photos.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <Spinner className="h-8 w-8 text-muted-foreground" />
        </div>
      ) : photos.length === 0 ? (
        !error && (
          <div className="rounded-2xl border border-border/50 bg-card/40 px-6 py-16 text-center text-muted-foreground">
            No photos to display.
          </div>
        )
      ) : (
        <MasonryGrid
          items={photos}
          getKey={(photo) => photo.id}
          renderItem={(photo, index) => (
            <PhotoCard
              photo={photo}
              onOpen={() => setSelected(photo)}
              priority={index < 4}
            />
          )}
        />
      )}

      <div ref={sentinelRef} className="flex justify-center py-8">
        {isLoadingMore && <Spinner className="h-6 w-6 text-muted-foreground" />}
      </div>

      <PhotoDetailModal photo={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </>
  );
}

function PhotoCard({
  photo,
  onOpen,
  priority = false,
}: {
  photo: FootagePhoto;
  onOpen: () => void;
  priority?: boolean;
}) {
  const aspectRatio = photo.width && photo.height ? photo.width / photo.height : 4 / 3;
  const placeholderColor = photo.color ?? "#1f2937";
  const altText = photo.altDescription || photo.description || `Photo by ${photo.author.name}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open details for photo by ${photo.author.name}`}
      className="group relative block w-full overflow-hidden rounded-xl border border-border/50 bg-card/40 text-left smooth hover:border-blue-500/40 hover:shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
    >
      <div
        className="relative w-full"
        style={{ aspectRatio: `${aspectRatio}`, backgroundColor: placeholderColor }}
      >
        <Image
          src={photo.urls.small}
          alt={altText}
          fill
          unoptimized
          priority={priority}
          loading={priority ? "eager" : "lazy"}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover smooth group-hover:scale-[1.02]"
        />
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/70 via-black/0 to-black/0 opacity-90" />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 p-3">
          {photo.author.avatar && (
            <Image
              src={photo.author.avatar}
              alt={photo.author.name}
              width={28}
              height={28}
              unoptimized
              className="h-7 w-7 rounded-full border border-white/20 object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white drop-shadow">
              {photo.author.name}
            </p>
            <p className="truncate text-[11px] text-white/70">
              {photo.author.username ? `@${photo.author.username}` : "Unsplash"}
            </p>
          </div>
          {photo.likes > 0 && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
              <Heart className="h-3 w-3" />
              {photo.likes.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function PhotoDetailModal({
  photo,
  onOpenChange,
}: {
  photo: FootagePhoto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = useState<FootagePhotoDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequestRef = useRef(0);

  useEffect(() => {
    if (!photo) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    const requestId = ++detailRequestRef.current;
    setDetail(null);
    setDetailLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/stock/unsplash/${encodeURIComponent(photo.id)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as FootagePhotoDetail;
        if (detailRequestRef.current === requestId) setDetail(data);
      } catch (err) {
        if (detailRequestRef.current === requestId) {
          console.error("[footages] photo detail fetch failed", err);
          setDetail(null);
        }
      } finally {
        if (detailRequestRef.current === requestId) setDetailLoading(false);
      }
    })();
  }, [photo]);

  const description = detail?.description ?? photo?.description ?? photo?.altDescription ?? null;
  const tags = detail?.tags ?? photo?.tags ?? [];

  return (
    <Dialog open={photo !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[92vh] w-[calc(100%-2rem)] overflow-hidden p-0 sm:max-w-5xl",
          "border-blue-500/30 bg-card/95 backdrop-blur",
        )}
      >
        {photo && (
          <div className="grid max-h-[92vh] grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div
              className="relative flex max-h-[60vh] min-h-[280px] items-center justify-center bg-black md:max-h-[92vh]"
              style={{ backgroundColor: photo.color ?? "#000" }}
            >
              <Image
                src={photo.urls.regular}
                alt={photo.altDescription || photo.description || "Unsplash photo"}
                width={photo.width}
                height={photo.height}
                unoptimized
                className="h-full max-h-[60vh] w-auto max-w-full object-contain md:max-h-[92vh]"
              />
            </div>

            <div className="flex max-h-[60vh] flex-col overflow-y-auto p-6 md:max-h-[92vh]">
              <DialogHeader className="space-y-3 text-left">
                <div className="flex items-center gap-3">
                  {photo.author.avatar && (
                    <Image
                      src={photo.author.avatar}
                      alt={photo.author.name}
                      width={40}
                      height={40}
                      unoptimized
                      className="h-10 w-10 rounded-full border border-border object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="truncate text-base">
                      {photo.author.name}
                    </DialogTitle>
                    <DialogDescription className="truncate">
                      <a
                        href={withUtm(photo.author.profileUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground"
                      >
                        {photo.author.username ? `@${photo.author.username}` : "View on Unsplash"}
                      </a>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="mt-5 space-y-4 text-sm">
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Description
                  </h3>
                  <p className="leading-relaxed text-foreground">
                    {description || (
                      <span className="italic text-muted-foreground">No description provided.</span>
                    )}
                  </p>
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tags
                  </h3>
                  {tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-border/60 bg-foreground/5 px-2.5 py-1 text-xs text-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : detailLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Spinner className="h-3 w-3" />
                      Loading tags…
                    </div>
                  ) : (
                    <p className="italic text-muted-foreground">No tags available.</p>
                  )}
                </section>

                <section className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div className="rounded-lg border border-border/50 bg-card/40 p-3">
                    <p className="text-[11px] uppercase tracking-wider">Resolution</p>
                    <p className="mt-1 text-foreground">
                      {photo.width.toLocaleString()} × {photo.height.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-card/40 p-3">
                    <p className="text-[11px] uppercase tracking-wider">Likes</p>
                    <p className="mt-1 text-foreground">
                      {(detail?.likes ?? photo.likes).toLocaleString()}
                    </p>
                  </div>
                  {detail?.camera && (
                    <div className="col-span-2 rounded-lg border border-border/50 bg-card/40 p-3">
                      <p className="text-[11px] uppercase tracking-wider">Camera</p>
                      <p className="mt-1 text-foreground">{detail.camera}</p>
                    </div>
                  )}
                  {detail?.location && (
                    <div className="col-span-2 rounded-lg border border-border/50 bg-card/40 p-3">
                      <p className="text-[11px] uppercase tracking-wider">Location</p>
                      <p className="mt-1 text-foreground">{detail.location}</p>
                    </div>
                  )}
                </section>

                <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                  <Button
                    asChild
                    className="rounded-full bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-blue-400"
                  >
                    <a
                      href={withUtm(photo.htmlLink)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-1.5 h-4 w-4" />
                      View on Unsplash
                    </a>
                  </Button>
                  <Button asChild variant="outline" className="rounded-full">
                    <a
                      href={withUtm(photo.author.profileUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Author profile
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
