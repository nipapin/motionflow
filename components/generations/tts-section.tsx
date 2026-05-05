"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Download, Trash2 } from "lucide-react";
import type { TtsHistory } from "@/lib/generations-types";
import { CircularLoader } from "@/components/ui/circular-loader";
import { downloadUrlAsFile } from "@/lib/download-url-as-file";
import { replicateFileUrlToDisplaySrc } from "@/lib/replicate-file-display-url";
import { WaveformPlayer } from "@/components/waveform-player";

interface Props {
  items: TtsHistory[];
  onRemove: (id: string) => void;
}

export function TtsSection({ items, onRemove }: Props) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm sm:p-5">
      {items.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            No text-to-speech yet.{" "}
            <Link
              href="/text-to-speech"
              className="font-medium text-foreground underline underline-offset-4 hover:opacity-90"
            >
              Open TTS
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <TtsCard key={item.id} item={item} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  item: TtsHistory;
  onRemove: (id: string) => void;
}

function TtsCard({ item, onRemove }: CardProps) {
  const [downloading, setDownloading] = useState(false);
  const displayAudioUrl = item.audioUrl
    ? replicateFileUrlToDisplaySrc(item.audioUrl)
    : null;

  const onDownload = useCallback(async () => {
    if (!displayAudioUrl || downloading) return;
    await downloadUrlAsFile(
      displayAudioUrl,
      `motionflow-speech-${item.id.slice(0, 8)}`,
      { onLoadingChange: setDownloading },
    );
  }, [displayAudioUrl, downloading, item.id]);

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border/50 bg-muted/15 p-3 transition-colors hover:bg-muted/25">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground line-clamp-2" title={item.text}>
          {item.text || (item.recordStatus === "failed" ? "—" : "Untitled")}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {item.recordStatus === "failed" && item.errorMessage ? (
            <span className="text-red-400/90">{item.errorMessage}</span>
          ) : (
            <>
              {item.voice ? `${item.voice} · ` : ""}
              {item.speed}x
            </>
          )}{" "}
          | {item.timestamp.toLocaleString()}
        </p>
        {displayAudioUrl ? (
          <WaveformPlayer
            audioUrl={displayAudioUrl}
            className="mt-3 rounded-lg border border-border/50 bg-background/60 px-3 py-2"
          />
        ) : null}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {displayAudioUrl ? (
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
