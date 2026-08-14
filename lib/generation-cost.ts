/**
 * CEP AI generation metering.
 * Captions / Chapters: 1 gen per 10 minutes (ceil).
 * Voiceover (tts): 1 gen per 1000 characters (ceil).
 */

/** Minutes of audio → generations. 1–10 min = 1, 11–20 = 2, … */
export function durationGenerationsCost(durationSeconds: number): number {
  const sec = Number(durationSeconds);
  if (!(sec > 0) || !Number.isFinite(sec)) return 1;
  const minutes = sec / 60;
  return Math.max(1, Math.ceil(minutes / 10));
}

/** Character count → generations. 1–1000 = 1, 1001–2000 = 2, … */
export function textGenerationsCost(charCount: number): number {
  const n = Math.max(0, Math.floor(Number(charCount) || 0));
  if (n <= 0) return 1;
  return Math.max(1, Math.ceil(n / 1000));
}

export function parseDurationSeconds(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/** Span from caption/transcript chunks with [start, end] timestamps (seconds). */
export function durationFromTimestampChunks(
  chunks: ReadonlyArray<{ timestamp: [number, number] }>,
): number | undefined {
  let min = Infinity;
  let max = -Infinity;
  for (const c of chunks) {
    const start = Number(c.timestamp?.[0]);
    const end = Number(c.timestamp?.[1]);
    if (Number.isFinite(start)) min = Math.min(min, start);
    if (Number.isFinite(end)) max = Math.max(max, end);
  }
  if (!(max > min) || !Number.isFinite(min) || !Number.isFinite(max)) return undefined;
  return max - min;
}

/**
 * Authoritative duration for metering = max of available signals.
 * Never trust client alone — under-reporting would under-bill.
 */
export function resolveMeterDuration(options: {
  clientSeconds?: number;
  modelSeconds?: number;
  fromTimestamps?: number;
}): number {
  const candidates = [
    options.clientSeconds,
    options.modelSeconds,
    options.fromTimestamps,
  ].filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0,
  );
  return candidates.length ? Math.max(...candidates) : 0;
}
