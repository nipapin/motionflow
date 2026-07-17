"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Download } from "lucide-react";
import { MasonryGrid } from "@/components/masonry-grid";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useDownloadAsset } from "@/components/use-download-asset";
import { cn } from "@/lib/utils";
import type { FootagePhoto } from "@/app/(main)/api/stock/unsplash/route";
import type { FootagePhotoDetail } from "@/app/(main)/api/stock/unsplash/[id]/route";

const UTM = "?utm_source=motionflow&utm_medium=referral";

function withUtm(url: string): string {
  if (!url) return url;
  return url.includes("?") ? `${url}&utm_source=motionflow&utm_medium=referral` : `${url}${UTM}`;
}

const QUERIES = [
  "aerial cityscape",
  "ocean waves dramatic",
  "mountain wilderness",
  "street photography moody",
  "forest light",
  "desert dunes golden",
];

export function FootagesPromo() {
  const [photos, setPhotos] = useState<FootagePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<FootagePhoto | null>(null);
  const { download, isDownloading } = useDownloadAsset();

  useEffect(() => {
    const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
    const page = Math.floor(Math.random() * 3) + 1;
    fetch(`/api/stock/unsplash?q=${encodeURIComponent(query)}&per_page=15&page=${page}`)
      .then((r) => r.json())
      .then((data: { results?: FootagePhoto[] }) => {
        setPhotos(data.results?.slice(0, 15) ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="mb-12">
      {/* Header — matches ProductGrid style */}
      <div className="mb-8 flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Stock Footages
        </h2>
        <Link
          href="/footages"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface/50 px-4 py-2 text-sm font-medium text-foreground transition hover:border-line-strong hover:bg-surface"
        >
          Browse all
          <ArrowRight className="h-3.5 w-3.5 opacity-70" />
        </Link>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 15 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/3] animate-pulse rounded-xl bg-surface-2"
            />
          ))}
        </div>
      ) : photos.length > 0 ? (
        <div className="relative">
          <MasonryGrid
            items={photos}
            getKey={(p) => p.id}
            columnsClassName="columns-2 sm:columns-3 lg:columns-4 xl:columns-5"
            gapClassName="gap-2 sm:gap-3 lg:gap-4"
            itemSpacingClassName="mb-2 sm:mb-3 lg:mb-4"
            renderItem={(photo, index) => (
              <PromoPhotoCard
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
              />
            )}
          />
          {/* Bottom fade */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-[50%] bg-gradient-to-t from-background from-40% via-background/60 via-70% to-transparent" />
        </div>
      ) : null}


      {/* Full-screen photo modal */}
      <PhotoDetailModal
        photo={selectedPhoto}
        onOpenChange={(open) => { if (!open) setSelectedPhoto(null); }}
        onDownload={(photo) =>
          void download({
            provider: "unsplash",
            kind: "image",
            id: photo.id,
            suggestedName: `motionflow-unsplash-${photo.id}.jpg`,
          })
        }
        isDownloading={isDownloading}
      />
    </section>
  );
}

function PromoPhotoCard({
  photo,
  onOpen,
  onDownload,
  isDownloading,
  priority = false,
}: {
  photo: FootagePhoto;
  onOpen: () => void;
  onDownload: () => void;
  isDownloading: boolean;
  priority?: boolean;
}) {
  const intrinsicAspectRatio = photo.width && photo.height ? photo.width / photo.height : 4 / 3;
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
        <div className="relative w-full" style={{ aspectRatio: String(intrinsicAspectRatio), backgroundColor: placeholderColor }}>
          <Image
            src={photo.urls.small}
            alt={altText}
            fill
            unoptimized
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
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
            onClick={(e) => e.stopPropagation()}
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
            onClick={(e) => e.stopPropagation()}
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

function PhotoDetailModal({
  photo,
  onOpenChange,
  onDownload,
  isDownloading,
}: {
  photo: FootagePhoto | null;
  onOpenChange: (open: boolean) => void;
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
          console.error("[footages-promo] photo detail fetch failed", err);
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
        <DialogTitle className="sr-only">Photo details</DialogTitle>
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
