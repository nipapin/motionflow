import "server-only";
import type { RowDataPacket } from "mysql2";
import type { SqlParams } from "@/lib/author/sql-params";
import { getPool } from "@/lib/db";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";

export type ContributorItemRow = {
  id: number;
  name: string;
  index_category_slug: string;
  access: number;
  files: string | null;
  team: string | null;
  author_id: number;
};

function parseFilesImage(files: string | null): string | null {
  if (!files) return null;
  try {
    const j = JSON.parse(files) as { image?: string };
    return j.image ?? null;
  } catch {
    return null;
  }
}

export function itemAccessBadge(access: number): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (access === 1) return { label: "Published", variant: "default" };
  if (access === -10) return { label: "On processing", variant: "secondary" };
  if (access === 0) return { label: "Pending", variant: "outline" };
  if (access === -1) return { label: "Blocked", variant: "destructive" };
  return { label: `Status ${access}`, variant: "outline" };
}

export async function getContributorItemsPage(
  authorId: number,
  {
    team = false,
    page = 1,
    perPage = 24,
  }: { team?: boolean; page?: number; perPage?: number },
): Promise<{ items: ContributorItemRow[]; total: number }> {
  const pool = getPool();
  const table = marketplaceItemsTable();
  const offset = Math.max(0, (page - 1) * perPage);
  const limit = Math.min(Math.max(perPage, 1), 48);

  let whereSql: string;
  const params: SqlParams = [];

  if (team) {
    whereSql = `(
      mi.team LIKE ? OR (mi.author_id = ? AND mi.team IS NOT NULL AND mi.team != '' AND mi.team != 'null')
    )`;
    params.push(`%"co_author_id":${authorId}%`, authorId);
  } else {
    whereSql = "mi.author_id = ?";
    params.push(authorId);
  }

  const countSql = `SELECT COUNT(*) AS c FROM \`${table}\` AS mi WHERE ${whereSql}`;
  const [countRows] = await pool.execute<RowDataPacket[]>(countSql, params);
  const total = Number(countRows[0]?.c ?? 0);

  const listSql = `SELECT mi.id, mi.name, mi.index_category_slug, mi.access, mi.files, mi.team, mi.author_id
    FROM \`${table}\` AS mi
    WHERE ${whereSql}
    ORDER BY mi.id DESC
    LIMIT ? OFFSET ?`;
  const [rows] = await pool.execute<RowDataPacket[]>(listSql, [...params, limit, offset]);

  const items: ContributorItemRow[] = rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name ?? ""),
    index_category_slug: String(r.index_category_slug ?? ""),
    access: Number(r.access ?? 0),
    files: r.files == null ? null : String(r.files),
    team: r.team == null ? null : String(r.team),
    author_id: Number(r.author_id),
  }));

  return { items, total };
}

/** Public CDN URL for marketplace preview image (Laravel `r2-cdn` preview path). */
export function contributorPreviewUrl(item: ContributorItemRow): string | null {
  const image = parseFilesImage(item.files);
  if (!image) return null;
  const base =
    process.env.R2_PUBLIC_CDN?.replace(/\/+$/, "") ??
    process.env.NEXT_PUBLIC_R2_PUBLIC_CDN?.replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/preview/${item.id}/${image}`;
}
