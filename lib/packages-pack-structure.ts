import "server-only";

import { createHash } from "node:crypto";
import type { PackagesAuthor } from "@/lib/packages-admin";
import type { PackagesProjectDto } from "@/lib/packages-projects";
import {
  normalizePackManifest,
  resolvePackContentStem,
} from "@/lib/packages-pack-diff";
import { getR2Bucket, getR2Client } from "@/lib/r2-storage";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const PACK_JSON_EXT = /\.(spunkram|motionflow)$/i;

function resolveAuthorBucket(author: PackagesAuthor | null): string | null {
  const privateBucket = process.env.R2_BUCKET?.trim();
  return (
    author?.r2Bucket?.trim() ||
    privateBucket ||
    (() => {
      try {
        return getR2Bucket();
      } catch {
        return null;
      }
    })()
  );
}

async function getR2ObjectText(
  bucket: string,
  key: string,
): Promise<string | null> {
  const client = getR2Client();
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!res.Body) return null;
    return await res.Body.transformToString();
  } catch (err) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: unknown }).name)
        : "";
    const code =
      err && typeof err === "object" && "Code" in err
        ? String((err as { Code: unknown }).Code)
        : "";
    if (name === "NoSuchKey" || code === "NoSuchKey" || name === "NotFound") {
      return null;
    }
    throw err;
  }
}

function packNameSlug(name: string, id: number): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `pack-${id}`
  );
}

function findPackJsonPath(manifestRaw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestRaw);
  } catch {
    return null;
  }
  const map = normalizePackManifest(parsed);
  const paths = [...map.keys()].sort();
  for (const p of paths) {
    if (PACK_JSON_EXT.test(p) && !p.split("/").includes("..")) {
      return p.replace(/\\/g, "/").replace(/^\/+/, "");
    }
  }
  return null;
}

type PackJsonBody = {
  settings?: unknown;
  content?: unknown;
  contents?: unknown;
  structure?: unknown;
};

function normalizePackBody(raw: string): {
  settings: Record<string, unknown>;
  content: Record<string, unknown>;
} | null {
  let parsed: PackJsonBody;
  try {
    parsed = JSON.parse(raw) as PackJsonBody;
  } catch {
    return null;
  }
  const settings =
    parsed.settings && typeof parsed.settings === "object"
      ? (parsed.settings as Record<string, unknown>)
      : null;
  const contentRaw = parsed.content ?? parsed.contents ?? parsed.structure;
  const content =
    contentRaw && typeof contentRaw === "object"
      ? (contentRaw as Record<string, unknown>)
      : null;
  if (!settings || !content) return null;
  return { settings, content };
}

export type PackStructureResult =
  | {
      ok: true;
      pack_id: string;
      pack_name: string;
      version: string;
      etag: string;
      settings: Record<string, unknown>;
      content: Record<string, unknown>;
    }
  | {
      ok: false;
      error: "NO_DOWNLOAD_KEY" | "NO_BUCKET" | "NO_STRUCTURE";
    };

/**
 * Load plaintext pack JSON (`*.spunkram` / `*.motionflow`) from R2 `{stem}/`
 * using the remote manifest to locate the file.
 */
export async function loadPackStructureFromR2(opts: {
  project: PackagesProjectDto;
  author: PackagesAuthor | null;
}): Promise<PackStructureResult> {
  const stem = resolvePackContentStem(opts.project.downloadKey);
  if (!stem) return { ok: false, error: "NO_DOWNLOAD_KEY" };

  const bucket = resolveAuthorBucket(opts.author);
  if (!bucket) return { ok: false, error: "NO_BUCKET" };

  const manifestKey = `${stem}/manifest.json`;
  const manifestRaw = await getR2ObjectText(bucket, manifestKey);
  if (!manifestRaw) return { ok: false, error: "NO_STRUCTURE" };

  const relPath = findPackJsonPath(manifestRaw);
  if (!relPath) return { ok: false, error: "NO_STRUCTURE" };

  const packKey = `${stem}/${relPath}`.replace(/\/+/g, "/");
  const packRaw = await getR2ObjectText(bucket, packKey);
  if (!packRaw) return { ok: false, error: "NO_STRUCTURE" };

  const body = normalizePackBody(packRaw);
  if (!body) return { ok: false, error: "NO_STRUCTURE" };

  const etag = `"${createHash("sha256").update(packRaw).digest("hex").slice(0, 32)}"`;
  const main =
    body.settings.main && typeof body.settings.main === "object"
      ? (body.settings.main as Record<string, unknown>)
      : {};
  const version =
    (typeof main.version === "string" && main.version.trim()) ||
    opts.project.version?.trim() ||
    "1.0.0";

  return {
    ok: true,
    pack_id: String(opts.project.id),
    pack_name: packNameSlug(opts.project.name, opts.project.id),
    version,
    etag,
    settings: body.settings,
    content: body.content,
  };
}
