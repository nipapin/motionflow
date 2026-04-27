"use client";

import { Pause, Play } from "lucide-react";
import {
  seekGlobalAudioPlayback,
  toggleGlobalAudioPlayback,
  useGlobalAudioPlaybackState,
} from "@/components/waveform-player";

function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MobileAudioDrawer() {
  const { title, subtitle, isPlaying, currentTime, duration } = useGlobalAudioPlaybackState();
  if (!title) return null;

  const hasDuration = duration > 0;
  const progress = hasDuration ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-60 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] lg:hidden">
      <div className="rounded-2xl border border-border/70 bg-card/95 p-3 shadow-2xl backdrop-blur-xl">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={toggleGlobalAudioPlayback}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground/8 text-foreground hover:bg-foreground/12"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={progress}
          onChange={(e) => seekGlobalAudioPlayback(Number(e.target.value) / 100)}
          className="w-full accent-blue-500"
          aria-label="Seek playback"
        />

        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{hasDuration ? formatTime(duration) : "--:--"}</span>
        </div>
      </div>
    </div>
  );
}
