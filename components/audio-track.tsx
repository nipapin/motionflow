"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Download, Heart } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { Product } from "@/lib/product-types";
import { productCategoryLabel, productAudioUrl } from "@/lib/product-ui";
import { useFavorites } from "@/components/favorites-provider";
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
    for (let i = 0; i < barCount; i++) peaks[i] = Math.round((peaks[i] / globalMax) * 1000) / 1000;
  }
  return peaks;
}

// --------------- global playback (one track at a time) ---------------
let activeTrack: { pause: () => void } | null = null;

function claimPlayback(track: { pause: () => void }) {
  if (activeTrack && activeTrack !== track) activeTrack.pause();
  activeTrack = track;
}

function releasePlayback(track: { pause: () => void }) {
  if (activeTrack === track) activeTrack = null;
}

/** Stops the list row player (e.g. before opening the product modal). */
export function pauseGlobalAudioPlayback() {
  if (activeTrack) {
    activeTrack.pause();
    activeTrack = null;
  }
}

// --------------- helpers ---------------
interface AudioTrackProps {
  product: Product;
  onDownload?: (product: Product) => void;
  onClick?: () => void;
  containerClassName?: string;
}

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
export function AudioTrack({ product, onDownload, onClick, containerClassName }: AudioTrackProps) {
  const { isFav, toggle: toggleFav } = useFavorites();
  const favorited = isFav(product.id);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const audioUrl = productAudioUrl(product);

  // Load peaks only when visible (IntersectionObserver) + queued
  useEffect(() => {
    if (!audioUrl) return;

    // Already have them from in-memory cache
    if (peakCache.has(audioUrl)) {
      setPeaks(peakCache.get(audioUrl)!);
      return;
    }

    const el = rowRef.current;
    if (!el) return;

    let queueItem: QueueItem | null = null;
    let cancelled = false;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || queueItem || cancelled) return;
        obs.disconnect();

        queueItem = enqueue(async () => {
          if (cancelled) return;
          try {
            const data = await fetchPeaks(audioUrl);
            peakCache.set(audioUrl, data);
            if (!cancelled) setPeaks(data);
          } catch {}
        });
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);

    return () => {
      cancelled = true;
      if (queueItem) queueItem.cancelled = true;
      obs.disconnect();
    };
  }, [audioUrl]);

  // Fetch duration eagerly (metadata only, no full download)
  useEffect(() => {
    if (!audioUrl || duration > 0) return;
    const probe = new Audio();
    probe.preload = "metadata";
    probe.src = audioUrl;
    const onMeta = () => {
      setDuration(probe.duration);
      probe.src = "";
    };
    probe.addEventListener("loadedmetadata", onMeta, { once: true });
    return () => {
      probe.removeEventListener("loadedmetadata", onMeta);
      probe.src = "";
    };
  }, [audioUrl, duration]);

  // Reset everything when URL changes (e.g. product swap in modal)
  const prevUrlRef = useRef(audioUrl);
  useEffect(() => {
    if (prevUrlRef.current === audioUrl) return;
    prevUrlRef.current = audioUrl;
    audioRef.current?.pause();
    audioRef.current = null;
    setIsPlaying(false);
    setIsBuffering(false);
    setCurrentTime(0);
    setDuration(0);
    setPeaks(audioUrl && peakCache.has(audioUrl) ? peakCache.get(audioUrl)! : null);
  }, [audioUrl]);

  // Clean up audio on unmount
  useEffect(() => {
    const handle = { pause: () => { audioRef.current?.pause(); setIsPlaying(false); } };
    return () => {
      releasePlayback(handle);
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const getOrCreateAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    if (!audioUrl) return null;
    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    audioRef.current = audio;
    audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
    audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
    audio.addEventListener("playing", () => setIsBuffering(false));
    audio.addEventListener("waiting", () => setIsBuffering(true));
    audio.addEventListener("error", () => setIsBuffering(false));
    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setIsBuffering(false);
      setCurrentTime(0);
      releasePlayback({ pause: () => {} });
    });
    return audio;
  }, [audioUrl]);

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
      drawWaveform(canvas, activePeaks, duration > 0 ? currentTime / duration : 0);
    });
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [activePeaks, currentTime, duration]);

  const pauseThis = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setIsBuffering(false);
  }, []);

  const togglePlay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isPlaying || isBuffering) {
        pauseThis();
        releasePlayback({ pause: pauseThis });
      } else {
        const audio = getOrCreateAudio();
        if (!audio) return;
        const handle = { pause: pauseThis };
        claimPlayback(handle);
        if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
          setIsBuffering(true);
        }
        audio
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            setIsBuffering(false);
            releasePlayback(handle);
          });
      }
    },
    [isPlaying, isBuffering, getOrCreateAudio, pauseThis],
  );

  const handleWaveformClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.stopPropagation();
      const audio = getOrCreateAudio();
      const canvas = canvasRef.current;
      if (!audio || !canvas || !duration) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * duration;
      setCurrentTime(audio.currentTime);
    },
    [duration, getOrCreateAudio],
  );

  return (
    <div
      ref={rowRef}
      className={containerClassName ?? "group flex items-center gap-4 px-5 py-4 hover:bg-foreground/[0.02] smooth cursor-pointer"}
      onClick={onClick}
    >
      <button
        type="button"
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center text-foreground hover:bg-foreground hover:text-background smooth shrink-0"
        aria-label={isBuffering ? "Loading" : isPlaying ? "Pause" : "Play"}
      >
        {isBuffering ? (
          <Spinner className="w-4 h-4" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>

      <div className="w-48 shrink-0">
        <h3 className="text-sm font-medium text-foreground line-clamp-1">{product.name}</h3>
        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{productCategoryLabel(product)}</p>
      </div>

      <div className="relative flex-1 min-w-0 h-10">
        <canvas ref={canvasRef} onClick={handleWaveformClick} className="w-full h-full cursor-pointer text-foreground" />
      </div>

      <span className="text-xs text-muted-foreground tabular-nums w-12 text-right shrink-0">
        {duration > 0 ? (isPlaying ? formatTime(currentTime) : formatTime(duration)) : "--:--"}
      </span>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          className={cn(
            "w-9 h-9 flex items-center justify-center rounded-full smooth",
            favorited ? "text-red-400 hover:bg-red-500/10" : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
          )}
          aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
          onClick={(e) => { e.stopPropagation(); void toggleFav(product.id); }}
        >
          <Heart className={cn("w-4 h-4", favorited && "fill-current")} />
        </button>
        <button
          type="button"
          className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full smooth"
          aria-label="Download"
          onClick={(e) => {
            e.stopPropagation();
            onDownload?.(product);
          }}
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
