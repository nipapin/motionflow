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
    <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No speech-to-text generations yet.{" "}
          <Link href="/speech-to-text" className="text-blue-400 hover:underline">
            Create one
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
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
    <div className="flex items-start gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth">
      <div className="w-12 h-12 shrink-0 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center">
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
            className="mt-3 rounded-lg border border-blue-500/15 bg-background/40 px-3 py-2"
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
            className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
          >
            <FileText className="w-4 h-4" />
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
