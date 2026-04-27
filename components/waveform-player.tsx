"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const BAR_COUNT = 240;
const FLAT_PEAKS: number[] = new Array(BAR_COUNT).fill(0);
const CONCURRENCY = 2;

// --------------- global fetch queue (max 2 concurrent) ---------------
type QueueItem = { run: () => Promise<void>; cancelled: boolean };
const queue: QueueItem[] = [];
let running = 0;

function drain() {
  while (running < CONCURRENCY && queue.length > 0) {
    const item = queue.shift()!;
    if (item.cancelled) {
      drain();
      return;
    }
    running++;
    item.run().finally(() => {
      running--;
      drain();
    });
  }
}

function enqueue(run: () => Promise<void>): QueueItem {
  const item: QueueItem = { run, cancelled: false };
  queue.push(item);
  drain();
  return item;
}

// --------------- peak cache (in-memory, survives re-renders) ---------------
const peakCache = new Map<string, number[]>();

function extractPeaks(buffer: AudioBuffer, barCount: number): number[] {
  const raw = buffer.getChannelData(0);
  const step = Math.floor(raw.length / barCount);
  const peaks: number[] = new Array(barCount);
  let globalMax = 0;
  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    const start = i * step;
    const end = Math.min(start + step, raw.length);
    for (let j = start; j < end; j++) sum += raw[j] * raw[j];
    peaks[i] = Math.sqrt(sum / (end - start));
    if (peaks[i] > globalMax) globalMax = peaks[i];
  }
  if (globalMax > 0) {
    for (let i = 0; i < barCount; i++) {
      peaks[i] = Math.round((peaks[i] / globalMax) * 1000) / 1000;
    }
  }
  return peaks;
}

// --------------- global playback (one track at a time) ---------------
let activeTrack: { pause: () => void } | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeMeta: { title: string; subtitle?: string } | null = null;

type GlobalPlaybackState = {
  title: string | null;
  subtitle: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
};

const globalPlaybackListeners = new Set<() => void>();
const EMPTY_PLAYBACK_STATE: GlobalPlaybackState = {
  title: null,
  subtitle: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
};
let globalPlaybackSnapshot: GlobalPlaybackState = EMPTY_PLAYBACK_STATE;

function subscribeGlobalPlayback(listener: () => void): () => void {
  globalPlaybackListeners.add(listener);
  return () => globalPlaybackListeners.delete(listener);
}

function computeGlobalPlaybackSnapshot(): GlobalPlaybackState {
  return {
    title: activeMeta?.title ?? null,
    subtitle: activeMeta?.subtitle ?? null,
    isPlaying: !!activeAudio && !activeAudio.paused && !activeAudio.ended,
    currentTime: activeAudio?.currentTime ?? 0,
    duration: Number.isFinite(activeAudio?.duration) ? (activeAudio?.duration ?? 0) : 0,
  };
}

function refreshGlobalPlaybackSnapshot(): boolean {
  const next = computeGlobalPlaybackSnapshot();
  const prev = globalPlaybackSnapshot;
  if (
    prev.title === next.title &&
    prev.subtitle === next.subtitle &&
    prev.isPlaying === next.isPlaying &&
    prev.currentTime === next.currentTime &&
    prev.duration === next.duration
  ) {
    return false;
  }
  globalPlaybackSnapshot = next;
  return true;
}

function emitGlobalPlayback() {
  if (!refreshGlobalPlaybackSnapshot()) return;
  for (const listener of globalPlaybackListeners) listener();
}

function getGlobalPlaybackSnapshot(): GlobalPlaybackState {
  return globalPlaybackSnapshot;
}

function onGlobalAudioEvent() {
  emitGlobalPlayback();
}

function bindGlobalAudio(audio: HTMLAudioElement | null) {
  if (activeAudio) {
    activeAudio.removeEventListener("timeupdate", onGlobalAudioEvent);
    activeAudio.removeEventListener("loadedmetadata", onGlobalAudioEvent);
    activeAudio.removeEventListener("play", onGlobalAudioEvent);
    activeAudio.removeEventListener("pause", onGlobalAudioEvent);
    activeAudio.removeEventListener("ended", onGlobalAudioEvent);
  }
  activeAudio = audio;
  if (activeAudio) {
    activeAudio.addEventListener("timeupdate", onGlobalAudioEvent);
    activeAudio.addEventListener("loadedmetadata", onGlobalAudioEvent);
    activeAudio.addEventListener("play", onGlobalAudioEvent);
    activeAudio.addEventListener("pause", onGlobalAudioEvent);
    activeAudio.addEventListener("ended", onGlobalAudioEvent);
  }
  emitGlobalPlayback();
}

function claimPlayback(
  track: { pause: () => void },
  audio: HTMLAudioElement | null,
  meta?: { title: string; subtitle?: string },
) {
  if (activeTrack && activeTrack !== track) activeTrack.pause();
  activeTrack = track;
  activeMeta = meta ?? null;
  bindGlobalAudio(audio);
}

function releasePlayback(track: { pause: () => void }) {
  if (activeTrack === track) {
    activeTrack = null;
    bindGlobalAudio(null);
  }
}

/** Stops whichever WaveformPlayer is currently playing (e.g. before opening a modal). */
export function pauseGlobalAudioPlayback() {
  if (activeTrack) {
    activeTrack.pause();
    activeTrack = null;
    bindGlobalAudio(null);
  }
}

export function toggleGlobalAudioPlayback() {
  if (!activeAudio) return;
  if (activeAudio.paused) {
    void activeAudio.play().catch(() => {});
  } else {
    activeAudio.pause();
  }
}

export function seekGlobalAudioPlayback(ratio: number) {
  if (!activeAudio) return;
  const clamped = Math.max(0, Math.min(1, ratio));
  const duration = Number.isFinite(activeAudio.duration) ? activeAudio.duration : 0;
  if (duration <= 0) return;
  activeAudio.currentTime = clamped * duration;
  emitGlobalPlayback();
}

export function useGlobalAudioPlaybackState() {
  return useSyncExternalStore(subscribeGlobalPlayback, getGlobalPlaybackSnapshot, getGlobalPlaybackSnapshot);
}

// --------------- helpers ---------------
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getForegroundRgb(el: HTMLElement): string {
  const raw = getComputedStyle(el).color;
  const m = raw.match(/(\d+),\s*(\d+),\s*(\d+)/);
  return m ? `${m[1]}, ${m[2]}, ${m[3]}` : "255, 255, 255";
}

function drawWaveform(canvas: HTMLCanvasElement, peaks: number[], progress: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const rgb = getForegroundRgb(canvas);
  const baseColor = `rgba(${rgb}, 0.18)`;
  const playedColor = `rgba(${rgb}, 0.7)`;

  const barCount = peaks.length;
  if (barCount === 0) return;

  const mid = h / 2;
  const maxAmp = h * 0.45;
  const minAmp = 2;
  const stepX = w / (barCount - 1);
  const splitX = progress * w;

  function buildPath(startIdx: number, endIdx: number) {
    ctx!.beginPath();
    for (let i = startIdx; i <= endIdx; i++) {
      const x = i * stepX;
      const amp = Math.max(peaks[i] * maxAmp, minAmp);
      const y = mid - amp;
      if (i === startIdx) ctx!.moveTo(x, y);
      else ctx!.lineTo(x, y);
    }
    for (let i = endIdx; i >= startIdx; i--) {
      const x = i * stepX;
      const amp = Math.max(peaks[i] * maxAmp, minAmp);
      const y = mid + amp;
      ctx!.lineTo(x, y);
    }
    ctx!.closePath();
  }

  ctx.fillStyle = baseColor;
  buildPath(0, barCount - 1);
  ctx.fill();

  if (progress > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, splitX, h);
    ctx.clip();
    ctx.fillStyle = playedColor;
    buildPath(0, barCount - 1);
    ctx.fill();
    ctx.restore();
  }
}

async function fetchPeaks(audioUrl: string): Promise<number[]> {
  const encoded = encodeURIComponent(audioUrl);

  // 1. try server cache
  const cacheRes = await fetch(`/api/audio-peaks?url=${encoded}`);
  if (cacheRes.ok) {
    const data = await cacheRes.json();
    if (Array.isArray(data) && data.length > 0) return data;
  }

  // 2. decode via proxy
  const proxyRes = await fetch(`/api/audio-proxy?url=${encoded}`);
  if (!proxyRes.ok) throw new Error(`proxy ${proxyRes.status}`);
  const buf = await proxyRes.arrayBuffer();
  const actx = new AudioContext();
  const decoded = await actx.decodeAudioData(buf).finally(() => actx.close());
  const peaks = extractPeaks(decoded, BAR_COUNT);

  // 3. cache on server (fire-and-forget)
  fetch(`/api/audio-peaks?url=${encoded}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(peaks),
  }).catch(() => {});

  return peaks;
}

// --------------- component ---------------
export interface WaveformPlayerProps {
  /** Public audio URL. When `null`/empty, the player renders disabled. */
  audioUrl: string | null | undefined;
  /** Show a loading spinner instead of the play button. */
  loading?: boolean;
  /** Eager-load and decode peaks immediately (skip the IntersectionObserver). */
  eagerLoad?: boolean;
  /** Wrapper class for the `[play] [...] [waveform] [time] [...]` row. */
  className?: string;
  /** Class for the play/pause button. */
  buttonClassName?: string;
  /** Class for the canvas wrapper (defaults to `flex-1 min-w-0 h-10`). */
  waveformClassName?: string;
  /** Rendered between the play button and the waveform. */
  leadingSlot?: React.ReactNode;
  /** Rendered after the time readout (typical place for action buttons). */
  trailingSlot?: React.ReactNode;
  /** Optional metadata for global now-playing UI. */
  trackMeta?: { title: string; subtitle?: string };
  /** Optional class for time label. */
  timeClassName?: string;
  /** Hide canvas only on mobile while keeping layout spacing. */
  hideWaveformOnMobile?: boolean;
}

/**
 * Reusable waveform player used by Stock Music rows and the Text-to-Speech
 * generated-audio card. Coordinates with `pauseGlobalAudioPlayback` so only
 * one player is audible at a time.
 */
export function WaveformPlayer({
  audioUrl,
  loading = false,
  eagerLoad = false,
  className,
  buttonClassName,
  waveformClassName,
  leadingSlot,
  trailingSlot,
  trackMeta,
  timeClassName,
  hideWaveformOnMobile = false,
}: WaveformPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const url = audioUrl || "";

  useEffect(() => {
    if (!url) return;

    if (peakCache.has(url)) {
      setPeaks(peakCache.get(url)!);
      return;
    }

    let cancelled = false;
    let queueItem: QueueItem | null = null;

    const start = () => {
      queueItem = enqueue(async () => {
        if (cancelled) return;
        try {
          const data = await fetchPeaks(url);
          peakCache.set(url, data);
          if (!cancelled) setPeaks(data);
        } catch {
          /* ignore */
        }
      });
    };

    if (eagerLoad) {
      start();
      return () => {
        cancelled = true;
        if (queueItem) queueItem.cancelled = true;
      };
    }

    const el = rowRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || queueItem || cancelled) return;
        obs.disconnect();
        start();
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);

    return () => {
      cancelled = true;
      if (queueItem) queueItem.cancelled = true;
      obs.disconnect();
    };
  }, [url, eagerLoad]);

  // Probe duration via metadata-only request.
  useEffect(() => {
    if (!url || duration > 0) return;
    const probe = new Audio();
    probe.preload = "metadata";
    probe.src = url;
    const onMeta = () => {
      setDuration(probe.duration);
      probe.src = "";
    };
    probe.addEventListener("loadedmetadata", onMeta, { once: true });
    return () => {
      probe.removeEventListener("loadedmetadata", onMeta);
      probe.src = "";
    };
  }, [url, duration]);

  // Reset internal state if the URL changes (e.g. user re-generates speech).
  const prevUrlRef = useRef(url);
  useEffect(() => {
    if (prevUrlRef.current === url) return;
    prevUrlRef.current = url;
    audioRef.current?.pause();
    audioRef.current = null;
    setIsPlaying(false);
    setIsBuffering(false);
    setCurrentTime(0);
    setDuration(0);
    setPeaks(url && peakCache.has(url) ? peakCache.get(url)! : null);
  }, [url]);

  const getOrCreateAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    if (!url) return null;
    const audio = new Audio(url);
    audio.preload = "auto";
    audioRef.current = audio;
    audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
    audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
    audio.addEventListener("playing", () => {
      setIsBuffering(false);
      setIsPlaying(true);
    });
    audio.addEventListener("play", () => setIsPlaying(true));
    audio.addEventListener("pause", () => {
      setIsPlaying(false);
      setIsBuffering(false);
    });
    audio.addEventListener("waiting", () => setIsBuffering(true));
    audio.addEventListener("error", () => setIsBuffering(false));
    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setIsBuffering(false);
      setCurrentTime(0);
      emitGlobalPlayback();
    });
    return audio;
  }, [url]);

  const activePeaks = peaks ?? FLAT_PEAKS;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawWaveform(canvas, activePeaks, duration > 0 ? currentTime / duration : 0);
  }, [activePeaks, currentTime, duration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => {
      drawWaveform(
        canvas,
        activePeaks,
        duration > 0 ? currentTime / duration : 0,
      );
    });
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [activePeaks, currentTime, duration]);

  const pauseThis = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setIsBuffering(false);
  }, []);

  const handleRef = useRef<{ pause: () => void }>({ pause: pauseThis });
  useEffect(() => {
    handleRef.current.pause = pauseThis;
  }, [pauseThis]);

  useEffect(() => {
    return () => {
      releasePlayback(handleRef.current);
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const togglePlay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!url) return;
      if (isPlaying || isBuffering) {
        pauseThis();
      } else {
        const audio = getOrCreateAudio();
        if (!audio) return;
        const handle = handleRef.current;
        claimPlayback(handle, audio, trackMeta);
        if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
          setIsBuffering(true);
        }
        audio
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            setIsBuffering(false);
            releasePlayback(handleRef.current);
          });
      }
    },
    [url, isPlaying, isBuffering, getOrCreateAudio, pauseThis, trackMeta],
  );

  const handleWaveformClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.stopPropagation();
      const audio = getOrCreateAudio();
      const canvas = canvasRef.current;
      if (!audio || !canvas || !duration) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      audio.currentTime = ratio * duration;
      setCurrentTime(audio.currentTime);
    },
    [duration, getOrCreateAudio],
  );

  const showSpinner = loading || isBuffering;
  const disabled = !url || loading;

  return (
    <div
      ref={rowRef}
      className={cn("flex items-center gap-4 min-w-0", className)}
    >
      <button
        type="button"
        onClick={togglePlay}
        disabled={disabled}
        className={cn(
          "w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center text-foreground hover:bg-foreground hover:text-background smooth shrink-0 disabled:opacity-50 disabled:cursor-not-allowed",
          buttonClassName,
        )}
        aria-label={
          showSpinner ? "Loading" : isPlaying ? "Pause" : "Play"
        }
      >
        {showSpinner ? (
          <Spinner className="w-4 h-4" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>

      {leadingSlot}

      <div
        className={cn(
          "relative flex-1 min-w-0 h-10",
          waveformClassName,
        )}
      >
        <canvas
          ref={canvasRef}
          onClick={handleWaveformClick}
          className={cn(
            "w-full h-full cursor-pointer text-foreground",
            hideWaveformOnMobile && "hidden sm:block",
          )}
        />
      </div>

      <span
        className={cn(
          "text-[11px] sm:text-xs text-muted-foreground tabular-nums w-10 sm:w-12 text-right shrink-0",
          timeClassName,
        )}
      >
        {duration > 0
          ? isPlaying
            ? formatTime(currentTime)
            : formatTime(duration)
          : "--:--"}
      </span>

      {trailingSlot}
    </div>
  );
}
