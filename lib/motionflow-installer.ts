import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client } from "@/lib/r2-storage";

export const installerManifestKey = "public/downloads/motionflow/installer/latest.json";
export type InstallerAsset = {
  id: "cep" | "ffmpeg";
  key: string;
  bytes: number;
  sha256: string;
  unpackedSha256?: string;
  unpackedBytes?: number;
};
export type SetupAsset = { key: string; bytes: number; sha256: string };
export type InstallerManifest = { schema: 1; product: "motionflow"; version: string; assets: InstallerAsset[]; setup?: SetupAsset };

/** This public distribution endpoint never accepts an object key or external URL. */
export function validateInstallerManifest(value: unknown): InstallerManifest {
  if (!value || typeof value !== "object") throw new Error("Invalid installer manifest");
  const m = value as InstallerManifest;
  if (m.schema !== 1 || m.product !== "motionflow" || !/^\d+\.\d+\.\d+$/.test(m.version) || !Array.isArray(m.assets) || m.assets.length !== 2) throw new Error("Invalid installer manifest");
  const seen = new Set<string>();
  for (const a of m.assets) {
    if (!a || !["cep", "ffmpeg"].includes(a.id) || seen.has(a.id) || !/^[a-f0-9]{64}$/.test(a.sha256) || !Number.isSafeInteger(a.bytes) || a.bytes <= 0 || a.bytes > 300 * 1024 * 1024) throw new Error("Invalid installer asset");
    seen.add(a.id);
    const expected = a.id === "cep" ? `public/downloads/motionflow/${m.version}/motionflow.zip` : `public/downloads/motionflow/runtime/ffmpeg/${a.unpackedSha256}.exe.gz`;
    if (a.key !== expected) throw new Error("Invalid installer object key");
    if (a.id === "ffmpeg" && (!/^[a-f0-9]{64}$/.test(a.unpackedSha256 || "") || !Number.isSafeInteger(a.unpackedBytes) || !a.unpackedBytes || a.unpackedBytes <= 0 || a.unpackedBytes > 300 * 1024 * 1024)) throw new Error("Invalid FFmpeg asset");
  }
  if (m.setup && (m.setup.key !== `public/downloads/motionflow/${m.version}/MotionFlow-Setup.exe` || !Number.isSafeInteger(m.setup.bytes) || m.setup.bytes <= 0 || m.setup.bytes > 15 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(m.setup.sha256))) throw new Error("Invalid Setup asset");
  return m;
}

export async function readInstallerManifest(): Promise<InstallerManifest | null> {
  try {
    const object = await getR2Client().send(new GetObjectCommand({ Bucket: getR2Bucket(), Key: installerManifestKey }));
    if ((object.ContentLength || 0) > 16384) throw new Error("Installer manifest too large");
    const text = await object.Body?.transformToString("utf8");
    if (!text || text.length > 16384) throw new Error("Invalid installer manifest");
    return validateInstallerManifest(JSON.parse(text));
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

export async function installerDownload(asset: InstallerAsset | SetupAsset) {
  const object = await getR2Client().send(new GetObjectCommand({ Bucket: getR2Bucket(), Key: asset.key }));
  if (!object.Body || object.ContentLength !== asset.bytes) throw new Error("Installer object size mismatch");
  return object.Body.transformToWebStream();
}
