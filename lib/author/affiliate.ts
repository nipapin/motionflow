import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";

export type ShortLinkRow = {
  id: number;
  link: string;
  redirect: string;
  views: number;
  comment: string | null;
  arguments: string | null;
  createdAt: string;
  salesCount: number;
};

export async function getShortLinksForUser(userId: number): Promise<ShortLinkRow[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT sl.id, sl.link, sl.redirect, sl.views, sl.comment, sl.arguments, sl.created_at,
      COUNT(si.id) AS sales_count
     FROM short_links sl
     LEFT JOIN sold_items si ON si.ref_link_id = sl.id AND si.status = 1
     WHERE sl.bind_id = ?
     GROUP BY sl.id, sl.link, sl.redirect, sl.views, sl.comment, sl.arguments, sl.created_at
     ORDER BY sl.id DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    link: String(r.link ?? ""),
    redirect: String(r.redirect ?? ""),
    views: Number(r.views ?? 0),
    comment: r.comment == null ? null : String(r.comment),
    arguments: r.arguments == null ? null : String(r.arguments),
    createdAt: r.created_at ? String(r.created_at) : "",
    salesCount: Number(r.sales_count ?? 0),
  }));
}

function randomLinkToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function createShortLink(
  userId: number,
  redirect: string,
  comment: string | null,
): Promise<number> {
  const pool = getPool();
  for (let attempt = 0; attempt < 8; attempt++) {
    const link = randomLinkToken();
    try {
      const [res] = await pool.execute<ResultSetHeader>(
        `INSERT INTO short_links (\`link\`, bind_id, redirect, views, arguments, comment, created_at, updated_at)
         VALUES (?, ?, ?, 0, NULL, ?, NOW(), NOW())`,
        [link, userId, redirect, comment],
      );
      if (res.insertId) return Number(res.insertId);
    } catch {
      /* duplicate link — retry */
    }
  }
  throw new Error("Could not allocate short link");
}

export async function updateShortLink(
  userId: number,
  id: number,
  redirect: string,
  comment: string | null,
): Promise<boolean> {
  const pool = getPool();
  const [r] = await pool.execute<ResultSetHeader>(
    `UPDATE short_links SET redirect = ?, comment = ?, updated_at = NOW() WHERE id = ? AND bind_id = ?`,
    [redirect, comment, id, userId],
  );
  return Number(r.affectedRows ?? 0) > 0;
}

export async function getShortLinkById(
  userId: number,
  id: number,
): Promise<ShortLinkRow | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT sl.id, sl.link, sl.redirect, sl.views, sl.comment, sl.arguments, sl.created_at,
      COUNT(si.id) AS sales_count
     FROM short_links sl
     LEFT JOIN sold_items si ON si.ref_link_id = sl.id AND si.status = 1
     WHERE sl.bind_id = ? AND sl.id = ?
     GROUP BY sl.id, sl.link, sl.redirect, sl.views, sl.comment, sl.arguments, sl.created_at`,
    [userId, id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    link: String(r.link ?? ""),
    redirect: String(r.redirect ?? ""),
    views: Number(r.views ?? 0),
    comment: r.comment == null ? null : String(r.comment),
    arguments: r.arguments == null ? null : String(r.arguments),
    createdAt: r.created_at ? String(r.created_at) : "",
    salesCount: Number(r.sales_count ?? 0),
  };
}
