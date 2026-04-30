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
    <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No text-to-speech generations yet.{" "}
          <Link href="/text-to-speech" className="text-blue-400 hover:underline">
            Create one
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
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
    <div className="flex items-center gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth">
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
            className="mt-3 rounded-lg border border-blue-500/15 bg-background/40 px-3 py-2"
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
            className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth disabled:opacity-50"
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
          className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
