import "server-only";
import type { RowDataPacket } from "mysql2";
import type { SqlParams } from "@/lib/author/sql-params";
import { getPool } from "@/lib/db";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";

export type ModerationTab = "wait" | "soft" | "reject" | "blocked";

export type ModerationItemRow = {
  id: number;
  name: string;
  index_category_slug: string;
  access: number;
  files: string | null;
  author_id: number;
  author_name: string | null;
  approval_status: string | null;
  approval_comment: string | null;
};

const PER_PAGE = 30;

function tabWhereClause(tab: ModerationTab): { sql: string; params: SqlParams } {
  switch (tab) {
    case "wait":
      return {
        sql: `mi.access = 0 AND (ar.status IS NULL OR ar.status = 'check')`,
        params: [],
      };
    case "soft":
      return {
        sql: `mi.access = 0 AND ar.status = 'soft_reject'`,
        params: [],
      };
    case "reject":
      return {
        sql: `mi.access = -1 AND ar.status = 'rejected'`,
        params: [],
      };
    case "blocked":
      return {
        sql: `mi.access = -1 AND (ar.status IS NULL OR ar.status = 'blocked')`,
        params: [],
      };
    default:
      return tabWhereClause("wait");
  }
}

const JOIN_SQL = `
  FROM \`MARKETPLACE_ITEMS\` AS mi
  INNER JOIN users u ON u.id = mi.author_id
  LEFT JOIN (
    SELECT MAX(ar1.id) AS last_id, ar1.item_id
    FROM approval_requires ar1
    GROUP BY ar1.item_id
  ) ar_last ON ar_last.item_id = mi.id
  LEFT JOIN approval_requires ar ON ar.id = ar_last.last_id
`;

export async function getModerationTabCounts(): Promise<Record<ModerationTab, number>> {
  const pool = getPool();
  const table = marketplaceItemsTable();
  const join = JOIN_SQL.replace("`MARKETPLACE_ITEMS`", `\`${table}\``);

  const tabs: ModerationTab[] = ["wait", "soft", "reject", "blocked"];
  const out = {} as Record<ModerationTab, number>;
  await Promise.all(
    tabs.map(async (tab) => {
      const { sql, params } = tabWhereClause(tab);
      const fullSql = `SELECT COUNT(*) AS c ${join} WHERE ${sql}`;
      const [rows] = await pool.execute<RowDataPacket[]>(fullSql, params);
      out[tab] = Number(rows[0]?.c ?? 0);
    }),
  );
  return out;
}

export async function getModerationItemsPage(
  tab: ModerationTab,
  page: number,
): Promise<{ items: ModerationItemRow[]; total: number }> {
  const pool = getPool();
  const table = marketplaceItemsTable();
  const join = JOIN_SQL.replace("`MARKETPLACE_ITEMS`", `\`${table}\``);
  const { sql: whereSql, params: whereParams } = tabWhereClause(tab);
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * PER_PAGE;

  const countSql = `SELECT COUNT(*) AS c ${join} WHERE ${whereSql}`;
  const [countRows] = await pool.execute<RowDataPacket[]>(countSql, whereParams);
  const total = Number(countRows[0]?.c ?? 0);

  const listSql = `
    SELECT mi.id, mi.name, mi.index_category_slug, mi.access, mi.files, mi.author_id,
           u.name AS author_name,
           ar.status AS approval_status,
           ar.comment AS approval_comment
    ${join}
    WHERE ${whereSql}
    ORDER BY COALESCE(ar.updated_at, mi.updated_at, mi.created_at) DESC, mi.created_at DESC
    LIMIT ${PER_PAGE} OFFSET ${offset}
  `;
  const [rows] = await pool.execute<RowDataPacket[]>(listSql, whereParams);

  const items: ModerationItemRow[] = rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name ?? ""),
    index_category_slug: String(r.index_category_slug ?? ""),
    access: Number(r.access ?? 0),
    files: r.files == null ? null : String(r.files),
    author_id: Number(r.author_id),
    author_name: r.author_name == null ? null : String(r.author_name),
    approval_status: r.approval_status == null ? null : String(r.approval_status),
    approval_comment: r.approval_comment == null ? null : String(r.approval_comment),
  }));

  return { items, total };
}

export function parseModerationTab(raw: string | undefined): ModerationTab {
  if (raw === "soft" || raw === "reject" || raw === "blocked" || raw === "wait") return raw;
  return "wait";
}
