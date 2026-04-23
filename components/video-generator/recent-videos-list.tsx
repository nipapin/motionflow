"use client";

import Link from "next/link";
import { Download, RotateCcw, Trash2 } from "lucide-react";
import type { RecentVideo } from "@/components/video-generator";
import { stylePresets } from "@/components/video-generator";

interface RecentVideosListProps {
  videos: RecentVideo[];
  onOpenLightbox: (url: string) => void;
  onRepeat: (item: RecentVideo) => void;
  onDelete: (id: string) => Promise<void>;
}

export function RecentVideosList({
  videos,
  onOpenLightbox,
  onRepeat,
  onDelete,
}: RecentVideosListProps) {
  return (
    <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">
          Recent generations
        </h3>
        <Link
          href="/profile/generations?tab=video"
          className="text-sm text-blue-400 hover:underline"
        >
          View all
        </Link>
      </div>
      <ul className="space-y-2">
        {videos.map((item) => {
          const styleLabel =
            stylePresets.find((s) => s.id === item.style)?.label ?? item.style;
          return (
            <li
              key={item.id}
              className="flex items-center gap-3 p-2 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth"
            >
              <button
                type="button"
                onClick={() => onOpenLightbox(item.url)}
                className="w-20 h-14 shrink-0 rounded-lg overflow-hidden border border-blue-500/20 bg-black hover:opacity-80 smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              >
                <video
                  src={item.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                />
              </button>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm text-foreground truncate"
                  title={item.prompt}
                >
                  {item.prompt || "Untitled"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {styleLabel} · {item.aspectRatio} · {item.durationSec}s
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onRepeat(item)}
                  title="Repeat with same settings"
                  aria-label="Repeat generation"
                  className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <a
                  href={item.url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  title="Download"
                  aria-label="Download video"
                  className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => void onDelete(item.id)}
                  title="Delete"
                  aria-label="Delete generation"
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
