import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { odinAiStatus, type OdinAiUser } from "@/lib/odin-ai";

type UsageRow = RowDataPacket & { operation_id: string; tool: string; cost: number; created_ts: number };
const PAGE_SIZE = 20;

export function usagePage(value: unknown): number {
  const page = value === undefined || value === null ? 1 : Number(value);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new Error("INVALID_PAGE");
  return page;
}

/** Current allocation and its committed charges; result bodies never leave storage. */
export async function odinAccountUsage(user: OdinAiUser, page: number) {
  const balance = await odinAiStatus(user);
  if (!balance.period_id) return { balance, usage: { items: [], total: 0, page, pageSize: PAGE_SIZE } };
  const args = [user.id, balance.period_id];
  const [[counts], [rows]] = await Promise.all([
    getPool().execute<(RowDataPacket & { total: number })[]>(
      "SELECT count(*) AS total FROM odin_ai_operations WHERE user_id=? AND period_id=?", args),
    getPool().execute<UsageRow[]>(`SELECT operation_id,tool,cost,UNIX_TIMESTAMP(created_at) AS created_ts
      FROM odin_ai_operations WHERE user_id=? AND period_id=?
      ORDER BY created_at DESC,operation_id DESC LIMIT ? OFFSET ?`, [...args, PAGE_SIZE, (page - 1) * PAGE_SIZE]),
  ]);
  return { balance, usage: {
    items: rows.map(row => ({ id: row.operation_id, tool: row.tool, cost: Number(row.cost),
      createdAt: new Date(Number(row.created_ts) * 1000).toISOString() })),
    total: Number(counts[0].total), page, pageSize: PAGE_SIZE,
  } };
}
