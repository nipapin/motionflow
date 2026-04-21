"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Download,
  ImageIcon,
  Trash2,
  Video,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";

const videoStylePresets = [
  { id: "cinematic", label: "Cinematic" },
  { id: "anime", label: "Anime" },
  { id: "realistic", label: "Realistic" },
  { id: "artistic", label: "Artistic" },
];

const imageStylePresets = [
  { id: "realistic", label: "Realistic" },
  { id: "anime", label: "Anime" },
  { id: "3d", label: "3D Render" },
  { id: "digital-art", label: "Digital Art" },
  { id: "oil-painting", label: "Oil Painting" },
  { id: "watercolor", label: "Watercolor" },
];

type ApiGenerationRecord = {
  id: string;
  status: string;
  settings: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

interface VideoHistory {
  id: string;
  prompt: string;
  style: string;
  durationSec: string;
  aspectRatio: string;
  videoUrl: string;
  timestamp: Date;
  kind?: "generate" | "extend";
  recordStatus?: "ok" | "failed";
  errorMessage?: string;
  firstFrameUrl?: string;
}

interface ImageHistory {
  id: string;
  prompt: string;
  style: string;
  ratio: string;
  images: string[];
  timestamp: Date;
  recordStatus?: "ok" | "failed";
  errorMessage?: string;
}

function mapVideoRecord(row: ApiGenerationRecord): VideoHistory {
  const s = row.settings;
  const kind = s.kind === "extend" ? "extend" : "generate";
  const videoUrl =
    row.status === "ok" &&
    row.result &&
    typeof row.result.video === "string"
      ? row.result.video
      : "";
  return {
    id: row.id,
    prompt: typeof s.prompt === "string" ? s.prompt : "",
    style: typeof s.style === "string" ? s.style : "realistic",
    durationSec:
      kind === "extend"
        ? String(s.extend_duration ?? "")
        : String(s.duration ?? ""),
    aspectRatio:
      typeof s.aspect_ratio === "string" ? s.aspect_ratio : "16:9",
    videoUrl,
    timestamp: new Date(row.created_at),
    kind,
    recordStatus: row.status === "failed" ? "failed" : "ok",
    errorMessage: row.error_message ?? undefined,
    firstFrameUrl:
      typeof s.first_frame_url === "string" ? s.first_frame_url : undefined,
  };
}

function mapImageRecord(row: ApiGenerationRecord): ImageHistory {
  const s = row.settings;
  const images =
    row.status === "ok" &&
    row.result &&
    Array.isArray(row.result.images) &&
    row.result.images.every((x) => typeof x === "string")
      ? (row.result.images as string[])
      : [];
  return {
    id: row.id,
    prompt: typeof s.prompt === "string" ? s.prompt : "",
    style: typeof s.style === "string" ? s.style : "realistic",
    ratio: typeof s.aspect_ratio === "string" ? s.aspect_ratio : "1:1",
    images,
    timestamp: new Date(row.created_at),
    recordStatus: row.status === "failed" ? "failed" : "ok",
    errorMessage: row.error_message ?? undefined,
  };
}

export function ProfileGenerations() {
  const { user } = useAuth();
  const [videoItems, setVideoItems] = useState<VideoHistory[]>([]);
  const [imageItems, setImageItems] = useState<ImageHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxVideo, setLightboxVideo] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [videoRes, imageRes] = await Promise.all([
        fetch("/api/me/generation-records?tool=video&limit=100", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/me/generation-records?tool=image&limit=100", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      if (!videoRes.ok || !imageRes.ok) {
        throw new Error("Failed to load generations");
      }
      const videoData = (await videoRes.json()) as {
        items?: ApiGenerationRecord[];
      };
      const imageData = (await imageRes.json()) as {
        items?: ApiGenerationRecord[];
      };
      setVideoItems((videoData.items ?? []).map(mapVideoRecord));
      setImageItems((imageData.items ?? []).map(mapImageRecord));
    } catch {
      setError("Could not load your generations. Try again later.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const removeRecord = async (id: string, tool: "video" | "image") => {
    setDeleteError(null);
    try {
      const res = await fetch(`/api/me/generation-records/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("delete failed");
      if (tool === "video") {
        setVideoItems((prev) => prev.filter((h) => h.id !== id));
      } else {
        setImageItems((prev) => prev.filter((h) => h.id !== id));
      }
    } catch {
      setDeleteError("Could not remove this item.");
    }
  };

  if (!user) {
    return (
      <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-8 text-center">
        <p className="text-muted-foreground mb-4">
          Sign in to see your image and video generations.
        </p>
        <Button asChild className="bg-linear-to-r from-blue-600 to-blue-500 text-white rounded-xl">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mr-3" />
        Loading generations…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-card/50 p-8 text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <Button variant="secondary" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const videoSection = (
    <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Video className="w-5 h-5 text-blue-400" />
        <h2 className="text-lg font-medium text-foreground">Video</h2>
      </div>
      {videoItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No video generations yet.{" "}
          <Link
            href="/video-generation"
            className="text-blue-400 hover:underline"
          >
            Create one
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          {videoItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth"
            >
              <button
                type="button"
                className="relative w-24 h-14 rounded-lg overflow-hidden shrink-0 cursor-pointer hover:opacity-80 smooth bg-black disabled:opacity-50"
                onClick={() =>
                  item.videoUrl ? setLightboxVideo(item.videoUrl) : undefined
                }
                disabled={!item.videoUrl}
              >
                {item.videoUrl ? (
                  <video
                    src={item.videoUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground px-1">
                    Failed
                  </div>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{item.prompt}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {item.recordStatus === "failed" && item.errorMessage ? (
                    <span className="text-red-400/90">{item.errorMessage}</span>
                  ) : item.kind === "extend" ? (
                    <>
                      <span className="text-foreground/90">Extend</span>
                      {" · "}
                      {item.prompt}
                      {" · "}
                      {item.durationSec}s
                    </>
                  ) : (
                    <>
                      {videoStylePresets.find((s) => s.id === item.style)
                        ?.label}{" "}
                      | {item.durationSec}s | {item.aspectRatio}
                      {item.firstFrameUrl ? (
                        <span className="text-foreground/80"> · first frame</span>
                      ) : null}
                    </>
                  )}{" "}
                  | {item.timestamp.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {item.videoUrl ? (
                  <a
                    href={item.videoUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => void removeRecord(item.id, "video")}
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const imageSection = (
    <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
      <div className="flex items-center gap-2 mb-4">
        <ImageIcon className="w-5 h-5 text-blue-400" />
        <h2 className="text-lg font-medium text-foreground">Images</h2>
      </div>
      {imageItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No image generations yet.{" "}
          <Link
            href="/image-generation"
            className="text-blue-400 hover:underline"
          >
            Create one
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          {imageItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth"
            >
              {item.images[0] ? (
                <button
                  type="button"
                  className="w-16 h-16 rounded-lg overflow-hidden shrink-0 cursor-pointer hover:opacity-80 smooth border-0 p-0 bg-transparent"
                  onClick={() => setLightboxImage(item.images[0])}
                >
                  <img
                    src={item.images[0]}
                    alt={item.prompt}
                    className="w-full h-full object-cover"
                  />
                </button>
              ) : (
                <div className="w-16 h-16 rounded-lg bg-muted shrink-0 flex items-center justify-center text-xs text-muted-foreground text-center px-1">
                  {item.recordStatus === "failed" ? "Failed" : "—"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{item.prompt}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {item.recordStatus === "failed" && item.errorMessage ? (
                    <span className="text-red-400/90">{item.errorMessage}</span>
                  ) : (
                    <>
                      {imageStylePresets.find((s) => s.id === item.style)?.label}{" "}
                      | {item.ratio}
                    </>
                  )}{" "}
                  | {item.timestamp.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {item.images[0] ? (
                  <a
                    href={item.images[0]}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => void removeRecord(item.id, "image")}
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-foreground tracking-tight mb-2">
          My generations
        </h1>
        <p className="text-muted-foreground">
          Image and video outputs from the AI tools. Open a generator anytime from
          the sidebar.
        </p>
      </div>

      {deleteError ? (
        <p className="text-sm text-red-400 text-center">{deleteError}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-1">
        {videoSection}
        {imageSection}
      </div>

      {lightboxVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => setLightboxVideo(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxVideo(null)}
            className="absolute top-6 right-6 p-2 text-white/70 hover:text-white smooth z-10"
          >
            <X className="w-8 h-8" />
          </button>
          <div
            className="relative w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative rounded-2xl overflow-hidden border border-blue-500/30 bg-black">
              <video
                src={lightboxVideo}
                controls
                playsInline
                autoPlay
                className="w-full max-h-[80vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-6 right-6 p-2 text-white/70 hover:text-white smooth"
          >
            <X className="w-8 h-8" />
          </button>
          <div
            className="relative max-w-4xl max-h-[85vh] mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage}
              alt="Generated"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl border border-blue-500/30"
            />
          </div>
        </div>
      )}
    </div>
  );
}
