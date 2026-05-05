"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Download, Trash2 } from "lucide-react";
import type { VideoHistory } from "@/lib/generations-types";
import { VIDEO_STYLE_PRESETS } from "@/lib/generations-utils";
import { CircularLoader } from "@/components/ui/circular-loader";
import { downloadUrlAsFile } from "@/lib/download-url-as-file";
import { replicateFileUrlToDisplaySrc } from "@/lib/replicate-file-display-url";

interface Props {
  items: VideoHistory[];
  onPlay: (url: string) => void;
  onRemove: (id: string) => void;
}

export function VideoSection({ items, onPlay, onRemove }: Props) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm sm:p-5">
      {items.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            No video generations yet.{" "}
            <Link
              href="/video-generation"
              className="font-medium text-foreground underline underline-offset-4 hover:opacity-90"
            >
              Open video generator
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
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
  const [downloading, setDownloading] = useState(false);
  const displayVideoUrl = item.videoUrl
    ? replicateFileUrlToDisplaySrc(item.videoUrl)
    : null;

  const onDownload = useCallback(async () => {
    if (!displayVideoUrl || downloading) return;
    await downloadUrlAsFile(
      displayVideoUrl,
      `motionflow-video-${item.id.slice(0, 8)}`,
      { onLoadingChange: setDownloading },
    );
  }, [displayVideoUrl, downloading, item.id]);

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border/50 bg-muted/15 p-3 transition-colors hover:bg-muted/25">
      <button
        type="button"
        className="relative w-24 h-14 rounded-lg overflow-hidden shrink-0 cursor-pointer hover:opacity-80 smooth bg-black disabled:opacity-50"
        onClick={() => displayVideoUrl && onPlay(displayVideoUrl)}
        disabled={!displayVideoUrl}
      >
        {displayVideoUrl ? (
          <video
            src={displayVideoUrl}
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
        {displayVideoUrl ? (
          <button
            type="button"
            onClick={() => void onDownload()}
            disabled={downloading}
            title="Download"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {downloading ? (
              <CircularLoader className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
