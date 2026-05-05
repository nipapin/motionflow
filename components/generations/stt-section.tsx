"use client";

import Link from "next/link";
import { FileText, Mic, Trash2 } from "lucide-react";
import type { SttHistory } from "@/lib/generations-types";
import { WaveformPlayer } from "@/components/waveform-player";

interface Props {
  items: SttHistory[];
  onViewTranscript: (item: SttHistory) => void;
  onRemove: (id: string) => void;
}

export function SttSection({ items, onViewTranscript, onRemove }: Props) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm sm:p-5">
      {items.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            No speech-to-text yet.{" "}
            <Link
              href="/speech-to-text"
              className="font-medium text-foreground underline underline-offset-4 hover:opacity-90"
            >
              Open STT
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <SttCard
              key={item.id}
              item={item}
              onViewTranscript={onViewTranscript}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  item: SttHistory;
  onViewTranscript: (item: SttHistory) => void;
  onRemove: (id: string) => void;
}

function SttCard({ item, onViewTranscript, onRemove }: CardProps) {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-border/50 bg-muted/15 p-3 transition-colors hover:bg-muted/25">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border/50">
        <Mic className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0">
        {item.recordStatus === "failed" ? (
          <p className="text-sm text-red-400/90 line-clamp-3">
            {item.errorMessage ?? "Failed"}
          </p>
        ) : (
          <p
            className="text-sm text-foreground line-clamp-2 whitespace-pre-line"
            title={item.text}
          >
            {item.text || "Empty transcription"}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {item.language ? `${item.language} · ` : ""}
          {item.timestamp.toLocaleString()}
        </p>
        {item.sourceUrl ? (
          <WaveformPlayer
            audioUrl={item.sourceUrl}
            className="mt-3 rounded-lg border border-border/50 bg-background/60 px-3 py-2"
          />
        ) : null}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {item.text ? (
          <button
            type="button"
            onClick={() => onViewTranscript(item)}
            title="View transcript"
            aria-label="View transcript"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <FileText className="w-4 h-4" />
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
