#!/usr/bin/env node
/**
 * Generate short audio previews for every TTS voice preset using Replicate's
 * `minimax/speech-2.8-hd` model and save them under `public/voice-previews/`.
 *
 * Usage:
 *   # Either export the token first…
 *   $env:REPLICATE_API_TOKEN="r8_..."   # PowerShell
 *   export REPLICATE_API_TOKEN="r8_..." # bash
 *   node scripts/generate-voice-previews.mjs
 *
 *   # …or rely on the built-in env-file loader (Node ≥ 20):
 *   node --env-file=.env scripts/generate-voice-previews.mjs
 *
 * Flags:
 *   --force         Re-generate even when the preview file already exists.
 *   --voice=<id>    Generate only the given voice id (can be repeated).
 *   --text="..."    Override the default preview phrase.
 *   --delay=<sec>   Seconds to wait between successful requests (default 11).
 *                   Replicate throttles to ~6 req/min while account credit is
 *                   below $5, so 11s avoids hitting 429. Set to 0 to disable.
 *   --retries=<n>   Max retries on 429 / transient errors (default 6).
 *
 * The generated files are NOT uploaded to R2 – they live in `public/` so the
 * UI can hit `/voice-previews/<voice_id>.mp3` directly.
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Replicate from "replicate";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

/** Keep this list in sync with `components/text-to-speech.tsx`. */
const VOICES = [
  "Wise_Woman",
  "Friendly_Person",
  "Inspirational_girl",
  "Deep_Voice_Man",
  "Calm_Woman",
  "Casual_Guy",
  "Lively_Girl",
  "Patient_Man",
  "Young_Knight",
  "Determined_Man",
  "Lovely_Girl",
  "Decent_Boy",
  "Imposing_Manner",
  "Elegant_Man",
  "Abbess",
  "Sweet_Girl_2",
  "Exuberant_Girl",
];

const DEFAULT_TEXT =
  "Hello and welcome to Motion Flow. Explore thousands of motion graphics, stock music, sound effects, and powerful AI tools.";

const TTS_MODEL = "minimax/speech-2.8-hd";

const OUTPUT_DIR = join(projectRoot, "public", "voice-previews");

function parseArgs(argv) {
  const opts = {
    force: false,
    voices: [],
    text: DEFAULT_TEXT,
    delaySec: 11,
    retries: 6,
  };
  for (const arg of argv.slice(2)) {
    if (arg === "--force" || arg === "-f") {
      opts.force = true;
    } else if (arg.startsWith("--voice=")) {
      opts.voices.push(arg.slice("--voice=".length));
    } else if (arg.startsWith("--text=")) {
      opts.text = arg.slice("--text=".length);
    } else if (arg.startsWith("--delay=")) {
      const n = Number(arg.slice("--delay=".length));
      if (Number.isFinite(n) && n >= 0) opts.delaySec = n;
    } else if (arg.startsWith("--retries=")) {
      const n = Number(arg.slice("--retries=".length));
      if (Number.isFinite(n) && n >= 0) opts.retries = Math.floor(n);
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/generate-voice-previews.mjs " +
          "[--force] [--voice=ID]... [--text=\"...\"] [--delay=SEC] [--retries=N]",
      );
      process.exit(0);
    } else {
      console.warn(`[voice-previews] ignoring unknown arg: ${arg}`);
    }
  }
  return opts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseRetryAfter(err) {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const status = Number((raw.match(/status\s+(\d{3})/i) ?? [])[1]);
  if (status !== 429 && status < 500) return null;
  const retryAfter = Number((raw.match(/"retry_after"\s*:\s*(\d+)/) ?? [])[1]);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return { status, waitMs: (retryAfter + 1) * 1000 };
  }
  return { status, waitMs: status === 429 ? 12_000 : 5_000 };
}

async function fileExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function extractAudioUrl(output) {
  if (!output) return null;
  if (typeof output === "string" && /^https?:\/\//i.test(output)) return output;
  const items = Array.isArray(output) ? output : [output];
  for (const item of items) {
    if (!item) continue;
    if (typeof item === "string" && /^https?:\/\//i.test(item)) return item;
    if (typeof item === "object" && typeof item.url === "function") {
      try {
        const u = item.url();
        if (typeof u === "string") return u;
        if (u != null) return u.toString();
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

async function downloadToFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status} ${res.statusText}) for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
  return buf.length;
}

async function generateOne(replicate, voiceId, text, destPath, maxRetries) {
  const input = {
    text,
    voice_id: voiceId,
    speed: 1,
    volume: 1,
    pitch: 0,
    emotion: "auto",
    english_normalization: true,
    sample_rate: 32000,
    bitrate: 128000,
    audio_format: "mp3",
    channel: "mono",
    language_boost: "English",
    subtitle_enable: false,
  };

  let attempt = 0;
  while (true) {
    try {
      const output = await replicate.run(TTS_MODEL, { input });
      const url = extractAudioUrl(output);
      if (!url) throw new Error("Replicate returned no audio URL");
      const bytes = await downloadToFile(url, destPath);
      return { url, bytes };
    } catch (err) {
      const retry = parseRetryAfter(err);
      if (!retry || attempt >= maxRetries) throw err;
      attempt += 1;
      const waitMs = retry.waitMs * Math.min(attempt, 3);
      process.stdout.write(
        `(${retry.status}, retry ${attempt}/${maxRetries} in ${Math.ceil(waitMs / 1000)}s) `,
      );
      await sleep(waitMs);
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.error(
      "[voice-previews] REPLICATE_API_TOKEN is not set. Export it or run with --env-file=.env",
    );
    process.exit(1);
  }

  const replicate = new Replicate({ auth: token });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const targets =
    opts.voices.length > 0
      ? opts.voices.filter((id) => {
          if (!VOICES.includes(id)) {
            console.warn(`[voice-previews] unknown voice id: ${id} (skipping)`);
            return false;
          }
          return true;
        })
      : VOICES;

  console.log(
    `[voice-previews] generating ${targets.length} preview(s) into ${OUTPUT_DIR}`,
  );
  console.log(`[voice-previews] text: ${JSON.stringify(opts.text)}`);

  let okCount = 0;
  let skippedCount = 0;
  const failures = [];
  let didGenerate = false;

  for (const voiceId of targets) {
    const destPath = join(OUTPUT_DIR, `${voiceId}.mp3`);
    if (!opts.force && (await fileExists(destPath))) {
      console.log(`  • ${voiceId}: already exists, skipping (use --force to overwrite)`);
      skippedCount += 1;
      continue;
    }

    if (didGenerate && opts.delaySec > 0) {
      await sleep(opts.delaySec * 1000);
    }

    process.stdout.write(`  • ${voiceId}: generating… `);
    try {
      const { bytes } = await generateOne(
        replicate,
        voiceId,
        opts.text,
        destPath,
        opts.retries,
      );
      console.log(`done (${(bytes / 1024).toFixed(1)} KB)`);
      okCount += 1;
      didGenerate = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAILED — ${msg}`);
      failures.push({ voiceId, error: msg });
      didGenerate = true;
    }
  }

  console.log("");
  console.log(
    `[voice-previews] done. generated=${okCount} skipped=${skippedCount} failed=${failures.length}`,
  );
  if (failures.length > 0) {
    for (const f of failures) console.error(`  ✗ ${f.voiceId}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[voice-previews] unexpected error:", err);
  process.exit(1);
});
