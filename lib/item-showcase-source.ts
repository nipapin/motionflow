import "server-only";

import type { RowDataPacket } from "mysql2";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";
import { getPool } from "@/lib/db";
import { getItemShowcasePrefix } from "@/lib/marketplace-showcase-prefix";
import { packShowcasePrefix } from "@/lib/pack-showcase-prefix";
import {
  ensurePackagesProjectsTable,
  packagesAuthorsTableName,
  packagesProjectsTableName,
} from "@/lib/packages-authors-db";
import type { PackagesProjectHost } from "@/lib/packages-projects";
import { ODIN_PACKAGES_AUTHOR_ID, ODIN_PACKAGES_SLUG } from "@/lib/odin-packages";

type PackRow = RowDataPacket & {
  id: number;
  name: string | null;
  host: string | null;
  download_key: string | null;
  r2_bucket: string | null;
};

type ItemRow = RowDataPacket & {
  index_category_slug: string | null;
  name: string | null;
};

const NAME_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "of",
  "pack",
  "the",
]);

function hostForCategory(slug: string | null | undefined): PackagesProjectHost | null {
  const value = (slug ?? "").trim().toLowerCase();
  if (value === "premiere-pro" || value === "premiere") return "PR";
  if (value === "after-effects") return "AE";
  return null;
}

function nameTokens(value: string | null | undefined): Set<string> {
  const tokens = (value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !NAME_STOPWORDS.has(token));
  return new Set(tokens);
}

/**
 * Preview folder for a marketplace item.
 *
 * A linked CEP pack wins: `{author bucket}/{zip name}/Previews/`.
 * A stored `showcase_prefix` is used only when no pack zip is linked.
 */
export async function resolveItemShowcasePrefix(itemId: number): Promise<string | null> {
  if (!Number.isFinite(itemId) || itemId < 1) return null;

  try {
    const automatic = await automaticShowcasePrefix(itemId);
    if (automatic) return automatic;
  } catch (err) {
    console.error("[item-showcase] pack prefix lookup failed", itemId, err);
  }

  return getItemShowcasePrefix(itemId);
}

async function automaticShowcasePrefix(itemId: number): Promise<string | null> {
  await ensurePackagesProjectsTable();
  const pool = getPool();
  const projects = packagesProjectsTableName();
  const authors = packagesAuthorsTableName();

  const [rows] = await pool.query<PackRow[]>(
    `SELECT p.id, p.name, p.host, p.download_key, a.r2_bucket
       FROM \`${projects}\` p
       JOIN \`${authors}\` a ON a.id = p.author_id
      WHERE p.marketplace_item_id = ? AND p.deleted_at IS NULL
        AND a.id <> ? AND a.slug <> ?
      ORDER BY p.id ASC`,
    [itemId, ODIN_PACKAGES_AUTHOR_ID, ODIN_PACKAGES_SLUG],
  );

  const candidates = rows.filter((row) => packShowcasePrefix(row.r2_bucket, row.download_key));
  if (candidates.length === 0) return null;

  const item = await itemHeading(itemId);
  const preferred = hostForCategory(item?.slug);
  const sameHost = preferred
    ? candidates.filter((row) => String(row.host ?? "").toUpperCase() === preferred)
    : [];
  const poolRows = sameHost.length > 0 ? sameHost : candidates;
  const chosen = pickPack(poolRows, item?.name ?? null);
  return packShowcasePrefix(chosen.r2_bucket, chosen.download_key);
}

function pickPack(rows: PackRow[], itemName: string | null): PackRow {
  if (rows.length === 1) return rows[0]!;
  const itemWords = nameTokens(itemName);
  let best = rows[0]!;
  let bestScore = -1;
  for (const row of rows) {
    let score = 0;
    for (const token of nameTokens(row.name)) {
      if (itemWords.has(token)) score += 1;
    }
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return best;
}

async function itemHeading(
  itemId: number,
): Promise<{ slug: string | null; name: string | null } | null> {
  const table = marketplaceItemsTable();
  try {
    const [rows] = await getPool().query<ItemRow[]>(
      `SELECT name, index_category_slug FROM \`${table}\` WHERE id = ? LIMIT 1`,
      [itemId],
    );
    const row = rows[0];
    if (!row) return null;
    const slug = row.index_category_slug;
    const name = row.name;
    return {
      slug: slug == null || String(slug).trim() === "" ? null : String(slug),
      name: name == null || String(name).trim() === "" ? null : String(name),
    };
  } catch (err) {
    console.error("[item-showcase] item lookup failed", itemId, err);
    return null;
  }
}
