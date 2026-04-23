"use client";

import Link from "next/link";
import { Download, Trash2 } from "lucide-react";
import type { VideoHistory } from "@/lib/generations-types";
import { VIDEO_STYLE_PRESETS } from "@/lib/generations-utils";

interface Props {
  items: VideoHistory[];
  onPlay: (url: string) => void;
  onRemove: (id: string) => void;
}

export function VideoSection({ items, onPlay, onRemove }: Props) {
  return (
    <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No video generations yet.{" "}
          <Link href="/video-generation" className="text-blue-400 hover:underline">
            Create one
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <VideoCard
              key={item.id}
              item={item}
              onPlay={onPlay}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  item: VideoHistory;
  onPlay: (url: string) => void;
  onRemove: (id: string) => void;
}

function VideoCard({ item, onPlay, onRemove }: CardProps) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth">
      <button
        type="button"
        className="relative w-24 h-14 rounded-lg overflow-hidden shrink-0 cursor-pointer hover:opacity-80 smooth bg-black disabled:opacity-50"
        onClick={() => item.videoUrl && onPlay(item.videoUrl)}
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
              {VIDEO_STYLE_PRESETS.find((s) => s.id === item.style)?.label} |{" "}
              {item.durationSec}s | {item.aspectRatio}
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
          onClick={() => onRemove(item.id)}
          className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
