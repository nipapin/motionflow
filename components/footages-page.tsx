"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import { Download, Search, X } from "lucide-react";
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
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDownloadAsset } from "@/components/use-download-asset";
import type { FootagePhoto, FootageSearchResult } from "@/app/api/stock/unsplash/route";
import type { FootagePhotoDetail } from "@/app/api/stock/unsplash/[id]/route";
import type {
  FootageVideo,
  FootageVideoSearchResult,
} from "@/app/api/stock/pexels/videos/route";
import { cn } from "@/lib/utils";
import { MasonryGrid } from "@/components/masonry-grid";

const ORIENTATION_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "landscape", label: "Landscape" },
  { value: "square", label: "Square" },
  { value: "portrait", label: "Portrait" },
] as const;

const ORIENTATION_TO_UNSPLASH: Record<OrientationValue, string> = {
  any: "",
  landscape: "landscape",
  square: "squarish",
  portrait: "portrait",
};

const ORIENTATION_TO_PEXELS: Record<OrientationValue, string> = {
  any: "",
  landscape: "landscape",
  square: "square",
  portrait: "portrait",
};

const RATIO_ASPECT: Record<Exclude<OrientationValue, "any">, string> = {
  landscape: "16 / 9",
  square: "1 / 1",
  portrait: "9 / 16",
};

type OrientationValue = (typeof ORIENTATION_OPTIONS)[number]["value"];
type TabValue = "images" | "videos";

const PER_PAGE = 24;
const UTM = "?utm_source=motionflow&utm_medium=referral";

type FeedState<T> = {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
};

const INITIAL_FEED_STATE: FeedState<never> = {
  items: [],
  page: 1,
  totalPages: 0,
  total: 0,
  isLoading: false,
  isLoadingMore: false,
  error: null,
};

function withUtm(url: string): string {
  if (!url) return url;
  return url.includes("?") ? `${url}&utm_source=motionflow&utm_medium=referral` : `${url}${UTM}`;
}

function hasMoreItems(feed: FeedState<unknown>): boolean {
  if (feed.totalPages > 0) return feed.page < feed.totalPages;
  return feed.items.length >= feed.page * PER_PAGE;
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function FootagesPage() {
  const [tab, setTab] = useState<TabValue>("images");
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [orientation, setOrientation] = useState<OrientationValue>("landscape");

  const [photosFeed, setPhotosFeed] = useState<FeedState<FootagePhoto>>(
    INITIAL_FEED_STATE as FeedState<FootagePhoto>,
  );
  const [videosFeed, setVideosFeed] = useState<FeedState<FootageVideo>>(
    INITIAL_FEED_STATE as FeedState<FootageVideo>,
  );
  const [selectedPhoto, setSelectedPhoto] = useState<FootagePhoto | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<FootageVideo | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const photoRequestIdRef = useRef(0);
  const videoRequestIdRef = useRef(0);
  const { download, isDownloading } = useDownloadAsset();

  const forcedAspectRatio = orientation === "any" ? null : RATIO_ASPECT[orientation];

  const fetchPhotos = useCallback(
    async (opts: { query: string; orientation: OrientationValue; page: number; append: boolean }) => {
      const { query, orientation: nextOrientation, page, append } = opts;
      const requestId = ++photoRequestIdRef.current;
      setPhotosFeed((prev) => ({
        ...prev,
        items: append ? prev.items : [],
        page: append ? prev.page : 1,
        totalPages: append ? prev.totalPages : 0,
        total: append ? prev.total : 0,
        isLoading: append ? prev.isLoading : true,
        isLoadingMore: append,
        error: null,
      }));

      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("perPage", String(PER_PAGE));
        if (query.trim()) params.set("query", query.trim());
        const apiOrientation = ORIENTATION_TO_UNSPLASH[nextOrientation].trim();
        if (apiOrientation) params.set("orientation", apiOrientation);

        const res = await fetch(`/api/stock/unsplash?${params.toString()}`);
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        const data = (await res.json()) as FootageSearchResult;
        if (requestId !== photoRequestIdRef.current) return;

        setPhotosFeed((prev) => {
          const merged = append ? mergeUniqueById(prev.items, data.results) : data.results;
          return {
            items: merged,
            total: data.total,
            totalPages: data.totalPages,
            page: data.page,
            isLoading: false,
            isLoadingMore: false,
            error: null,
          };
        });
      } catch (err) {
        if (requestId !== photoRequestIdRef.current) return;
        console.error("[footages] photos fetch failed", err);
        setPhotosFeed((prev) => ({
          ...prev,
          items: append ? prev.items : [],
          isLoading: false,
          isLoadingMore: false,
          error: "Could not load images. Please try again.",
        }));
      }
    },
    [],
  );

  const fetchVideos = useCallback(
    async (opts: { query: string; orientation: OrientationValue; page: number; append: boolean }) => {
      const { query, orientation: nextOrientation, page, append } = opts;
      const requestId = ++videoRequestIdRef.current;
      setVideosFeed((prev) => ({
        ...prev,
        items: append ? prev.items : [],
        page: append ? prev.page : 1,
        totalPages: append ? prev.totalPages : 0,
        total: append ? prev.total : 0,
        isLoading: append ? prev.isLoading : true,
        isLoadingMore: append,
        error: null,
      }));

      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("perPage", String(PER_PAGE));
        if (query.trim()) params.set("query", query.trim());
        const apiOrientation = ORIENTATION_TO_PEXELS[nextOrientation].trim();
        if (apiOrientation) params.set("orientation", apiOrientation);

        const res = await fetch(`/api/stock/pexels/videos?${params.toString()}`);
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        const data = (await res.json()) as FootageVideoSearchResult;
        if (requestId !== videoRequestIdRef.current) return;

        setVideosFeed((prev) => {
          const merged = append ? mergeUniqueById(prev.items, data.results) : data.results;
          return {
            items: merged,
            total: data.total,
            totalPages: data.totalPages,
            page: data.page,
            isLoading: false,
            isLoadingMore: false,
            error: null,
          };
        });
      } catch (err) {
        if (requestId !== videoRequestIdRef.current) return;
        console.error("[footages] videos fetch failed", err);
        setVideosFeed((prev) => ({
          ...prev,
          items: append ? prev.items : [],
          isLoading: false,
          isLoadingMore: false,
          error: "Could not load videos. Please try again.",
        }));
      }
    },
    [],
  );

  useEffect(() => {
    if (tab === "images") {
      void fetchPhotos({ query: activeQuery, orientation, page: 1, append: false });
      return;
    }
    void fetchVideos({ query: activeQuery, orientation, page: 1, append: false });
  }, [activeQuery, fetchPhotos, fetchVideos, orientation, tab]);

  const activeFeed = tab === "images" ? photosFeed : videosFeed;
  const activeHasMore = useMemo(() => hasMoreItems(activeFeed), [activeFeed]);

  const loadMore = useCallback(() => {
    if (activeFeed.isLoading || activeFeed.isLoadingMore || !activeHasMore) return;

    const nextPage = activeFeed.page + 1;
    if (tab === "images") {
      void fetchPhotos({ query: activeQuery, orientation, page: nextPage, append: true });
      return;
    }
    void fetchVideos({ query: activeQuery, orientation, page: nextPage, append: true });
  }, [activeFeed, activeHasMore, activeQuery, fetchPhotos, fetchVideos, orientation, tab]);

  useEffect(() => {
    if (!activeHasMore) return;
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
  }, [activeHasMore, loadMore]);

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
        <h1 className="mb-3 text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
          Footages
        </h1>
        <p className="max-w-3xl text-lg text-muted-foreground">
          Explore images and videos. Search by keyword and filter by orientation.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)} className="mb-6">
        <TabsList className="h-11 rounded-full p-1">
          <TabsTrigger
            value="images"
            className="rounded-full px-5 data-[state=active]:bg-linear-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white"
          >
            Images
          </TabsTrigger>
          <TabsTrigger
            value="videos"
            className="rounded-full px-5 data-[state=active]:bg-linear-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white"
          >
            Videos
          </TabsTrigger>
        </TabsList>

        <form
          onSubmit={handleSubmit}
          className="mt-4 flex flex-wrap items-center gap-3"
        >
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={tab === "images" ? "Search images…" : "Search videos…"}
              className="h-11 rounded-full border-blue-500/35 bg-linear-to-r from-blue-500/8 to-blue-900/12 pl-10 pr-20 focus-visible:border-blue-500/70"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-11 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <Button
              type="submit"
              size="icon"
              className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-blue-400"
              aria-label={tab === "images" ? "Search images" : "Search videos"}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>

          <Select
            value={orientation}
            onValueChange={(value) => setOrientation(value as OrientationValue)}
          >
            <SelectTrigger className="h-11 w-full rounded-full border-blue-500/35 bg-linear-to-r from-blue-500/8 to-blue-900/12 px-4 sm:w-[220px]">
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

        </form>

        <TabsContent value="images" className="mt-5">
          <FeedContent
            tab="images"
            feed={photosFeed}
            activeQuery={activeQuery}
            summaryLabel="images"
            emptyLabel="No images to display."
            renderItems={() =>
              orientation === "any" ? (
                <MasonryGrid
                  items={photosFeed.items}
                  getKey={(photo) => photo.id}
                  columnsClassName="columns-1 sm:columns-2 lg:columns-3 xl:columns-4"
                  gapClassName="gap-2"
                  itemSpacingClassName="mb-2"
                  renderItem={(photo, index) => (
                    <PhotoCard
                      photo={photo}
                      onOpen={() => setSelectedPhoto(photo)}
                      onDownload={() =>
                        void download({
                          provider: "unsplash",
                          kind: "image",
                          id: photo.id,
                          suggestedName: `motionflow-unsplash-${photo.id}.jpg`,
                        })
                      }
                      isDownloading={isDownloading}
                      priority={index < 4}
                      forcedAspectRatio={null}
                    />
                  )}
                />
              ) : (
                <FixedAspectGrid
                  items={photosFeed.items}
                  getKey={(photo) => photo.id}
                  orientation={orientation}
                  renderItem={(photo, index) => (
                    <PhotoCard
                      photo={photo}
                      onOpen={() => setSelectedPhoto(photo)}
                      onDownload={() =>
                        void download({
                          provider: "unsplash",
                          kind: "image",
                          id: photo.id,
                          suggestedName: `motionflow-unsplash-${photo.id}.jpg`,
                        })
                      }
                      isDownloading={isDownloading}
                      priority={index < 4}
                      forcedAspectRatio={forcedAspectRatio}
                    />
                  )}
                />
              )
            }
          />
        </TabsContent>

        <TabsContent value="videos" className="mt-5">
          <FeedContent
            tab="videos"
            feed={videosFeed}
            activeQuery={activeQuery}
            summaryLabel="videos"
            emptyLabel="No videos to display."
            renderItems={() =>
              orientation === "any" ? (
                <MasonryGrid
                  items={videosFeed.items}
                  getKey={(video) => video.id}
                  columnsClassName="columns-1 sm:columns-2 lg:columns-3 xl:columns-4"
                  gapClassName="gap-2"
                  itemSpacingClassName="mb-2"
                  renderItem={(video) => (
                    <VideoCard
                      video={video}
                      onOpen={() => setSelectedVideo(video)}
                      onDownload={() =>
                        void download({
                          provider: "pexels",
                          kind: "video",
                          id: video.id,
                          suggestedName: `motionflow-pexels-${video.id}.mp4`,
                        })
                      }
                      isDownloading={isDownloading}
                      forcedAspectRatio={null}
                    />
                  )}
                />
              ) : (
                <FixedAspectGrid
                  items={videosFeed.items}
                  getKey={(video) => video.id}
                  orientation={orientation}
                  renderItem={(video) => (
                    <VideoCard
                      video={video}
                      onOpen={() => setSelectedVideo(video)}
                      onDownload={() =>
                        void download({
                          provider: "pexels",
                          kind: "video",
                          id: video.id,
                          suggestedName: `motionflow-pexels-${video.id}.mp4`,
                        })
                      }
                      isDownloading={isDownloading}
                      forcedAspectRatio={forcedAspectRatio}
                    />
                  )}
                />
              )
            }
          />
        </TabsContent>
      </Tabs>

      <div ref={sentinelRef} className="flex justify-center py-8">
        {activeFeed.isLoadingMore && <Spinner className="h-6 w-6 text-muted-foreground" />}
      </div>

      <PhotoDetailModal
        photo={selectedPhoto}
        onOpenChange={(open) => !open && setSelectedPhoto(null)}
        onTagClick={(tag) => {
          setSearchInput(tag);
          setActiveQuery(tag);
          setSelectedPhoto(null);
        }}
        isDownloading={isDownloading}
        onDownload={(photo) =>
          void download({
            provider: "unsplash",
            kind: "image",
            id: photo.id,
            suggestedName: `motionflow-unsplash-${photo.id}.jpg`,
          })
        }
      />
      <VideoDetailModal
        video={selectedVideo}
        onOpenChange={(open) => !open && setSelectedVideo(null)}
        onTagClick={(tag) => {
          setSearchInput(tag);
          setActiveQuery(tag);
          setSelectedVideo(null);
          setTab("videos");
        }}
        isDownloading={isDownloading}
        onDownload={(video) =>
          void download({
            provider: "pexels",
            kind: "video",
            id: video.id,
            suggestedName: `motionflow-pexels-${video.id}.mp4`,
          })
        }
      />
    </>
  );
}

function FeedContent({
  tab,
  feed,
  activeQuery,
  summaryLabel,
  emptyLabel,
  renderItems,
}: {
  tab: TabValue;
  feed: FeedState<unknown>;
  activeQuery: string;
  summaryLabel: string;
  emptyLabel: string;
  renderItems: () => ReactNode;
}) {
  return (
    <>
      {activeQuery && !feed.isLoading && (
        <p className="mb-4 text-sm text-muted-foreground">
          {feed.total > 0 ? (
            <>
              Showing results for <span className="text-foreground">&ldquo;{activeQuery}&rdquo;</span>
              {" • "}
              <span>{feed.total.toLocaleString()} {summaryLabel}</span>
            </>
          ) : (
            <>No {summaryLabel} found for &ldquo;{activeQuery}&rdquo;.</>
          )}
        </p>
      )}

      {feed.error && (
        <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {feed.error}
        </div>
      )}

      {feed.isLoading && feed.items.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <Spinner className="h-8 w-8 text-muted-foreground" />
        </div>
      ) : feed.items.length === 0 ? (
        !feed.error && (
          <div className="rounded-2xl border border-border/50 bg-card/40 px-6 py-16 text-center text-muted-foreground">
            {emptyLabel}
          </div>
        )
      ) : (
        <div data-feed-tab={tab}>{renderItems()}</div>
      )}
    </>
  );
}

function FixedAspectGrid<T>({
  items,
  getKey,
  orientation,
  renderItem,
}: {
  items: T[];
  getKey: (item: T) => string;
  orientation: Exclude<OrientationValue, "any">;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        orientation === "square" && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
        orientation === "portrait" && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6",
        orientation === "landscape" && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
      )}
    >
      {items.map((item, index) => (
        <div key={getKey(item)} className="min-w-0">
          {renderItem(item, index)}
        </div>
      ))}
    </div>
  );
}

function PhotoCard({
  photo,
  onOpen,
  onDownload,
  isDownloading,
  priority = false,
  forcedAspectRatio,
}: {
  photo: FootagePhoto;
  onOpen: () => void;
  onDownload: () => void;
  isDownloading: boolean;
  priority?: boolean;
  forcedAspectRatio: string | null;
}) {
  const intrinsicAspectRatio = photo.width && photo.height ? photo.width / photo.height : 4 / 3;
  const aspectRatio = forcedAspectRatio ?? String(intrinsicAspectRatio);
  const placeholderColor = photo.color ?? "#1f2937";
  const altText = photo.altDescription || photo.description || `Photo by ${photo.author.name}`;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/40 smooth hover:border-blue-500/40 hover:shadow-[0_0_0_1px_rgba(59,130,246,0.25)]">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open details for photo by ${photo.author.name}`}
        className="relative block w-full cursor-pointer overflow-hidden text-left"
      >
        <div className="relative w-full" style={{ aspectRatio, backgroundColor: placeholderColor }}>
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
        </div>
      </button>

      <div className="absolute inset-x-0 bottom-0 z-10 p-3 text-[11px] text-white/90">
        <p className="inline-block max-w-full truncate rounded-md bg-black/35 px-3 py-1.5 backdrop-blur-sm whitespace-nowrap">
          <span>Photo by </span>
          <a
            href={withUtm(photo.author.profileUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-white"
          >
            {photo.author.name}
          </a>
          {" "}
          <span>on</span>
          {" "}
          <a
            href={withUtm("https://unsplash.com")}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-white"
          >
            Unsplash
          </a>
        </p>
      </div>

      <Button
        type="button"
        size="icon"
        variant="secondary"
        onClick={(e) => {
          e.stopPropagation();
          onDownload();
        }}
        disabled={isDownloading}
        className="absolute right-2 top-2 h-8 w-8 cursor-pointer rounded-full bg-black/60 text-white hover:bg-black/75"
        aria-label={`Download photo by ${photo.author.name}`}
      >
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
}

function VideoCard({
  video,
  onOpen,
  onDownload,
  isDownloading,
  forcedAspectRatio,
}: {
  video: FootageVideo;
  onOpen: () => void;
  onDownload: () => void;
  isDownloading: boolean;
  forcedAspectRatio: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const intrinsicAspectRatio = video.width && video.height ? video.width / video.height : 16 / 9;
  const aspectRatio = forcedAspectRatio ?? String(intrinsicAspectRatio);
  const startPreview = useCallback(() => {
    const node = videoRef.current;
    if (!node) return;
    node.currentTime = 0;
    void node.play().catch(() => {});
  }, []);

  const stopPreview = useCallback(() => {
    const node = videoRef.current;
    if (!node) return;
    node.pause();
    node.currentTime = 0;
  }, []);

  return (
    <div className="group relative" onMouseEnter={startPreview} onMouseLeave={stopPreview}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open details for video by ${video.author.name}`}
        className="relative block w-full cursor-pointer overflow-hidden rounded-xl border border-border/50 bg-card/40 text-left smooth hover:border-blue-500/40 hover:shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
      >
        <div className="relative w-full bg-black" style={{ aspectRatio }}>
          <video
            ref={videoRef}
            src={video.videoUrl}
            poster={video.image}
            muted
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-cover smooth group-hover:scale-[1.02]"
          />
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/70 via-black/0 to-black/0 opacity-90" />
        </div>
      </button>

      <div className="absolute inset-x-0 bottom-0 z-10 p-3">
        <div className="inline-flex max-w-full items-center gap-2 rounded-md bg-black/35 px-3 py-1.5 text-[11px] text-white/90 backdrop-blur-sm">
          <p className="min-w-0 truncate">
            <span>Video by </span>
            <a
              href={withUtm(video.author.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white"
            >
              {video.author.name}
            </a>
            {" "}
            <span>on</span>
            {" "}
            <a
              href={withUtm("https://www.pexels.com")}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white"
            >
              Pexels
            </a>
          </p>
          <span className="shrink-0 rounded-full bg-black/40 px-2.5 py-1 text-[11px] text-white">
            {formatDuration(video.duration)}
          </span>
        </div>
      </div>

      <Button
        type="button"
        size="icon"
        variant="secondary"
        onClick={(e) => {
          e.stopPropagation();
          onDownload();
        }}
        disabled={isDownloading}
        className="absolute right-2 top-2 h-8 w-8 cursor-pointer rounded-full bg-black/60 text-white hover:bg-black/75"
        aria-label={`Download video by ${video.author.name}`}
      >
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
}

function PhotoDetailModal({
  photo,
  onOpenChange,
  onTagClick,
  onDownload,
  isDownloading,
}: {
  photo: FootagePhoto | null;
  onOpenChange: (open: boolean) => void;
  onTagClick: (tag: string) => void;
  onDownload: (photo: FootagePhoto) => void;
  isDownloading: boolean;
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
          "max-h-[94vh] w-[calc(100%-2rem)] overflow-hidden p-0 sm:max-w-[min(95vw,1240px)]",
          "border-blue-500/30 bg-card/95 backdrop-blur",
        )}
      >
        {photo && (
          <div className="grid max-h-[94vh] grid-cols-1 md:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]">
            <div
              className="relative flex min-h-[320px] max-h-[80vh] items-center justify-center bg-black"
              style={{ backgroundColor: photo.color ?? "#000" }}
            >
              <Image
                src={photo.urls.regular}
                alt={photo.altDescription || photo.description || "Unsplash photo"}
                width={photo.width}
                height={photo.height}
                unoptimized
                className="h-full w-full object-cover"
              />
            </div>

            <div className="flex max-h-[80vh] flex-col overflow-y-auto p-6">
              <div className="space-y-4 text-sm">
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
                        <button
                          type="button"
                          key={tag}
                          onClick={() => onTagClick(tag)}
                          className="cursor-pointer rounded-full border border-border/60 bg-foreground/5 px-2.5 py-1 text-xs text-foreground transition-colors hover:border-blue-400/60 hover:bg-blue-500/10"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  ) : detailLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Spinner className="h-3 w-3" />
                      Loading tags...
                    </div>
                  ) : (
                    <p className="italic text-muted-foreground">No tags available.</p>
                  )}
                </section>

                <section className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div className="rounded-lg border border-border/50 bg-card/40 p-3">
                    <p className="text-[11px] uppercase tracking-wider">Resolution</p>
                    <p className="mt-1 text-foreground">
                      {photo.width.toLocaleString()} x {photo.height.toLocaleString()}
                    </p>
                  </div>
                </section>

                <div className="space-y-2 pt-2">
                  <Button
                    type="button"
                    onClick={() => onDownload(photo)}
                    disabled={isDownloading}
                    className="w-full rounded-full bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-blue-400"
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    Download image
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

function VideoDetailModal({
  video,
  onOpenChange,
  onTagClick,
  onDownload,
  isDownloading,
}: {
  video: FootageVideo | null;
  onOpenChange: (open: boolean) => void;
  onTagClick: (tag: string) => void;
  onDownload: (video: FootageVideo) => void;
  isDownloading: boolean;
}) {
  return (
    <Dialog open={video !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[94vh] w-[calc(100%-2rem)] overflow-hidden p-0 sm:max-w-[min(95vw,1240px)]",
          "border-blue-500/30 bg-card/95 backdrop-blur",
        )}
      >
        {video && (
          <div className="grid max-h-[94vh] grid-cols-1 md:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]">
            <div className="relative flex min-h-[320px] max-h-[80vh] items-center justify-center bg-black">
              <video
                src={video.videoUrl}
                poster={video.image}
                controls
                controlsList="nodownload"
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              />
            </div>

            <div className="flex max-h-[80vh] flex-col overflow-y-auto p-6">
              <div className="space-y-4 text-sm">
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Description
                  </h3>
                  <p className="leading-relaxed text-foreground">
                    {video.description ? (
                      video.description
                    ) : (
                      <span className="italic text-muted-foreground">No description provided.</span>
                    )}
                  </p>
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tags
                  </h3>
                  {video.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {video.tags.map((tag) => (
                        <button
                          type="button"
                          key={tag}
                          onClick={() => onTagClick(tag)}
                          className="cursor-pointer rounded-full border border-border/60 bg-foreground/5 px-2.5 py-1 text-xs text-foreground transition-colors hover:border-blue-400/60 hover:bg-blue-500/10"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="italic text-muted-foreground">No tags available.</p>
                  )}
                </section>

                <section className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div className="rounded-lg border border-border/50 bg-card/40 p-3">
                    <p className="text-[11px] uppercase tracking-wider">Resolution</p>
                    <p className="mt-1 text-foreground">
                      {video.width.toLocaleString()} x {video.height.toLocaleString()}
                    </p>
                  </div>
                </section>

                <div className="space-y-2 pt-2">
                  <Button
                    type="button"
                    onClick={() => onDownload(video)}
                    disabled={isDownloading}
                    className="w-full rounded-full bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-blue-400"
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    Download video
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

function mergeUniqueById<T extends { id: string }>(previous: T[], next: T[]): T[] {
  const seen = new Set(previous.map((item) => item.id));
  const merged = [...previous];
  for (const item of next) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}
