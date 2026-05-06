import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";

export type CommandSearchPayload = {
  items: { id: number; name: string }[];
  users: { id: number; name: string; email: string }[];
  requests: { id: number; type: string }[];
};

const LIMIT = 8;

/** Prefix search for admin command palette (investor+). */
export async function adminCommandSearch(q: string): Promise<CommandSearchPayload> {
  const term = q.trim();
  if (term.length < 2) {
    return { items: [], users: [], requests: [] };
  }
  const pool = getPool();
  const like = `%${term.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
  const itemsTable = marketplaceItemsTable();

  const [itemsRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, name FROM \`${itemsTable}\`
     WHERE CAST(id AS CHAR) LIKE ? OR name LIKE ?
     ORDER BY id DESC
     LIMIT ${LIMIT}`,
    [like, like],
  );

  const [userRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, name, email FROM users
     WHERE name LIKE ? OR email LIKE ? OR CAST(id AS CHAR) LIKE ?
     ORDER BY id DESC
     LIMIT ${LIMIT}`,
    [like, like, like],
  );

  const [reqRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, type FROM request_messages
     WHERE CAST(id AS CHAR) LIKE ? OR type LIKE ?
     ORDER BY id DESC
     LIMIT ${LIMIT}`,
    [like, like],
  );

  return {
    items: itemsRows.map((r) => ({ id: Number(r.id), name: String(r.name ?? "") })),
    users: userRows.map((r) => ({
      id: Number(r.id),
      name: String(r.name ?? ""),
      email: String(r.email ?? ""),
    })),
    requests: reqRows.map((r) => ({ id: Number(r.id), type: String(r.type ?? "") })),
  };
}
