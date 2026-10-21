import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { getTransaction, type PaddleApiAccount } from "@/lib/paddle-api";
import { accountingCatalog } from "./paddle-accounting/catalog.mjs";
import { createAccounting } from "./paddle-accounting/engine.mjs";

export type AccountingSource = { account: PaddleApiAccount; environment: "production" | "sandbox" };
export function accountingSource(account: PaddleApiAccount): AccountingSource {
  const env = account === "spunkram" ? process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_ENVIRONMENT : process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT;
  return { account, environment: env === "production" ? "production" : "sandbox" };
}

export function actualAccountingCatalog() {
  return accountingCatalog();
}

export const actualAccounting = createAccounting({
  getConnection: () => getPool().getConnection(), catalog: actualAccountingCatalog,
  marketTable: process.env.DB_MARKET_ITEMS_TABLE ?? "marketplace_items",
});

/** Resolve the original payment before deciding the version of a refund.
 * The refund's delivery date must never migrate a historical charge to v2.
 */
export async function actualAdjustment(data: Record<string, unknown>, source?: AccountingSource) {
  if (typeof data.transaction_id !== "string") throw new Error("Missing adjustment transaction");
  try {
    if (!source) {
      const [owners] = await getPool().execute<RowDataPacket[]>("SELECT DISTINCT account,environment FROM paddle_accounting_transactions WHERE transaction_id=?", [data.transaction_id]);
      if (owners.length > 1) throw new Error("Ambiguous Paddle account for adjustment");
      source = owners[0] ? { account: owners[0].account, environment: owners[0].environment } : accountingSource("default");
    }
    const [rows] = await getPool().execute<RowDataPacket[]>(`SELECT s.accept_new,
      EXISTS(SELECT 1 FROM paddle_accounting_transactions t WHERE t.account=? AND t.environment=? AND t.transaction_id=?) AS owned
      FROM paddle_accounting_settings s WHERE s.id=1`, [source.account,source.environment,data.transaction_id]);
    if (!rows[0]?.accept_new && !rows[0]?.owned) return { handled: false };
  } catch (error) {
    if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return { handled: false };
    throw error;
  }
  source ??= accountingSource("default");
  const transaction = await getTransaction(data.transaction_id, { account: source.account });
  return actualAccounting.adjustment(data, transaction, source);
}

export async function isActualSubscription(subscriptionId: string): Promise<boolean> {
  try {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      "SELECT id FROM paddle_accounting_transactions WHERE subscription_id=? LIMIT 1", [subscriptionId],
    );
    return rows.length > 0;
  } catch (error) {
    if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return false;
    throw error;
  }
}

export type ActualEarningsEntry = { id: string; transactionId: string; currency: string; amount: string | null; status: string; createdAt: string; adjustmentId: string | null };
export async function getActualEarningsEntries(userId: number): Promise<ActualEarningsEntry[]> {
  try {
    const pool = getPool();
    const [posted] = await pool.execute<RowDataPacket[]>(`SELECT CAST(MIN(m.id) AS CHAR) AS id,t.transaction_id,m.currency_code,
      SUM(m.amount_minor) AS minor_amount,'posted' AS status,DATE_FORMAT(MIN(m.created_at),'%Y-%m-%d %H:%i:%s') AS created_at,m.adjustment_id
      FROM paddle_accounting_movements m JOIN paddle_accounting_lines l ON l.id=m.line_row_id
      JOIN paddle_accounting_transactions t ON t.id=l.transaction_row_id
      WHERE m.user_id=? GROUP BY m.line_row_id,m.adjustment_id,t.transaction_id,m.currency_code
      ORDER BY created_at DESC LIMIT 24`, [userId]);
    const [pending] = await pool.execute<RowDataPacket[]>(`SELECT CONCAT('pending-',t.id) AS id,t.transaction_id,'USD' AS currency_code,
      NULL AS minor_amount,'pending' AS status,DATE_FORMAT(t.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,NULL AS adjustment_id
      FROM paddle_accounting_transactions t WHERE t.status='pending' AND JSON_CONTAINS(t.participants,?)
      ORDER BY created_at DESC LIMIT 24`, [String(userId)]);
    const [adjustments] = await pool.execute<RowDataPacket[]>(`SELECT CONCAT('adjustment-',a.id) AS id,t.transaction_id,'USD' AS currency_code,
      NULL AS minor_amount,'pending' AS status,DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,a.adjustment_id
      FROM paddle_accounting_adjustments a JOIN paddle_accounting_transactions t
      ON t.transaction_id=a.transaction_id AND t.account=a.account AND t.environment=a.environment
      WHERE a.status='pending' AND JSON_CONTAINS(t.participants,?)
      ORDER BY created_at DESC LIMIT 24`, [String(userId)]);
    const rows = [...posted,...pending,...adjustments].sort((a,b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0,24);
    return rows.map(r => ({ id: String(r.id), transactionId: String(r.transaction_id), currency: String(r.currency_code),
      amount: r.minor_amount == null ? null : (Number(r.minor_amount) / 100).toFixed(2), status: String(r.status),
      createdAt: String(r.created_at), adjustmentId: r.adjustment_id ? String(r.adjustment_id) : null }));
  } catch (error) {
    if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return [];
    throw error;
  }
}
