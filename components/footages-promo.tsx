"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useDownloadAsset } from "@/components/use-download-asset";
import { cn } from "@/lib/utils";
import type { FootagePhoto } from "@/app/(main)/api/stock/unsplash/route";
import type { FootagePhotoDetail } from "@/app/(main)/api/stock/unsplash/[id]/route";

const QUERIES = [
  "aerial cityscape",
  "ocean waves dramatic",
  "mountain wilderness",
  "street photography moody",
  "forest light",
  "desert dunes golden",
];

const COLLAGE_COUNT = 5;
/** First tile is the large hero cell; the rest fill the 2x2 grid beside it. */
const COLLAGE_SPANS = ["col-span-2 row-span-2", "", "", "", ""];

export function FootagesPromo() {
  const [photos, setPhotos] = useState<FootagePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<FootagePhoto | null>(null);
  const { download, isDownloading } = useDownloadAsset();

  useEffect(() => {
    const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
    const page = Math.floor(Math.random() * 3) + 1;
    fetch(`/api/stock/unsplash?q=${encodeURIComponent(query)}&per_page=${COLLAGE_COUNT}&page=${page}`)
      .then((r) => r.json())
      .then((data: { results?: FootagePhoto[] }) => {
        setPhotos(data.results?.slice(0, COLLAGE_COUNT) ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="mt-20 mb-12 sm:mt-28 lg:mt-36">
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
        {/* Copy */}
        <div className="flex flex-col items-center text-center lg:items-start lg:pl-6 lg:text-left xl:pl-10">
          <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-blue-500/30 bg-foreground/5 px-3.5 py-1.5 text-xs font-medium text-foreground sm:mb-6 sm:px-4 sm:py-2 sm:text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse sm:h-2 sm:w-2" />
            Stock Footages
          </span>
          <h2 className="mb-4 text-3xl font-semibold tracking-tight text-foreground sm:mb-5 sm:text-4xl lg:text-5xl">
            Explore millions of
            <br />
            stunning photos & videos
          </h2>
          <p className="mb-8 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:mb-10 sm:text-lg">
            Hand-picked, high-resolution visuals from creators around the world — ready to drop
            into your next edit. Completely free, no attribution required.
          </p>
          <Link
            href="/footages"
            className="inline-flex items-center gap-2 rounded-full bg-linear-to-r from-blue-600 to-blue-500 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 smooth hover-lift hover:from-blue-500 hover:to-blue-400 sm:px-9 sm:py-4 sm:text-base"
          >
            Browse all
            <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </Link>
        </div>

        {/* Photo collage */}
        <div className="grid aspect-[16/10] grid-cols-4 grid-rows-2 gap-3 sm:aspect-[2/1] lg:aspect-auto lg:h-[320px] lg:pr-6 xl:h-[360px] xl:pr-10">
          {loading
            ? Array.from({ length: COLLAGE_COUNT }).map((_, i) => (
                <div
                  key={i}
                  className={cn("animate-pulse rounded-xl bg-surface-2", COLLAGE_SPANS[i])}
                />
              ))
            : photos.map((photo, i) => (
                <CollagePhotoTile
                  key={photo.id}
                  photo={photo}
                  onOpen={() => setSelectedPhoto(photo)}
                  priority={i < 2}
                  className={COLLAGE_SPANS[i]}
                />
              ))}
        </div>
      </div>

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

function CollagePhotoTile({
  photo,
  onOpen,
  priority = false,
  className,
}: {
  photo: FootagePhoto;
  onOpen: () => void;
  priority?: boolean;
  className?: string;
}) {
  const placeholderColor = photo.color ?? "#1f2937";
  const altText = photo.altDescription || photo.description || `Photo by ${photo.author.name}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open details for photo by ${photo.author.name}`}
      className={cn(
        "group relative block h-full w-full cursor-pointer overflow-hidden rounded-xl border border-blue-500/30 bg-card/40 smooth hover-lift hover:border-2 hover:border-blue-500",
        className,
      )}
      style={{ backgroundColor: placeholderColor }}
    >
      <Image
        src={photo.urls.small}
        alt={altText}
        fill
        unoptimized
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        sizes="(max-width: 1024px) 50vw, 25vw"
        className="object-cover smooth group-hover:scale-[1.04]"
      />
    </button>
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
