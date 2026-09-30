import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { ODIN_PACKAGES_AUTHOR_ID } from "@/lib/odin-packages";
import { getPackagesAuthorById } from "@/lib/packages-admin";
import { listVisiblePackagesProjects } from "@/lib/packages-projects";
import { getPackagesProjectDownloadUrl } from "@/lib/packages-download";

export function odinCatalogAuthorized(header: string | null) {
  const secret = process.env.ODIN_CATALOG_SECRET;
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer ")) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(header.slice(7)), hash(secret));
}

export async function odinManagedPackages() {
  // Explicit mapping preserves the IDs already installed by Odin customers.
  // Only reviewed projects in this mapping can be served to the Odin backend.
  const mapping: unknown = JSON.parse(process.env.ODIN_CATALOG_PACK_MAP || "{}");
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) throw new Error("INVALID_PACK_MAP");
  const entries = Object.entries(mapping);
  if (!entries.length || entries.some(([legacy, project]) => !/^[1-9]\d*$/.test(legacy) || !Number.isSafeInteger(Number(legacy)) || !Number.isSafeInteger(project) || Number(project) <= 0)) throw new Error("INVALID_PACK_MAP");
  const ids = entries.map(([, id]) => id);
  if (new Set(ids).size !== ids.length) throw new Error("INVALID_PACK_MAP");
  const projects = await listVisiblePackagesProjects(ODIN_PACKAGES_AUTHOR_ID);
  const packs = entries.flatMap(([legacy, projectId]) => {
    const project = projects.find(p => p.id === projectId && !p.admin_only && p.downloadKey && p.version);
    return project ? [{ id: Number(legacy), project }] : [];
  });
  const editions = packs.map(p => `${p.project.host}:${p.project.version?.toUpperCase() === "DEMO" ? "demo" : "full"}`);
  if (new Set(editions).size !== editions.length) throw new Error("AMBIGUOUS_ODIN_PACKS");
  return packs;
}

export async function odinManagedDownload(packId: number) {
  const pack = (await odinManagedPackages()).find(p => p.id === packId);
  if (!pack) return null;
  const author = await getPackagesAuthorById(ODIN_PACKAGES_AUTHOR_ID);
  if (!author?.r2Bucket || !pack.project.downloadKey || pack.project.downloadKey.startsWith("public/")) throw new Error("PRIVATE_ODIN_BUCKET_REQUIRED");
  const url = await getPackagesProjectDownloadUrl({ ...pack.project, downloadUrl: null }, author);
  if (!url) throw new Error("DOWNLOAD_UNAVAILABLE");
  return { url, expires_in: 600 };
}
