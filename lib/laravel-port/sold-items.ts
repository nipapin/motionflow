import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

/**
 * Native port of Laravel `App\Models\SoldItems` — only the API-facing helpers
 * used by `routes/api.php` (`apiCheckPurchaseByCode`, `earningsApiStatsByItem`,
 * `salesApiStatsByItem`).
 */

export interface SoldItemPurchaseRow extends RowDataPacket {
    id: number;
    buyer_id: number;
    item_id: number;
    license: number;
    purchase_code: string;
    sold_price: string | number | null;
    sold_summary: string | number | null;
    created_at: Date | string | null;
    updated_at: Date | string | null;
    buyer_name: string | null;
}

/** Public shape returned to API consumers under the `collection` key. */
export interface SoldItemsResource {
    buyer_id: number;
    buyer_name: string | null;
    purchase_code: string;
    license: number;
    item_id: number;
    sold_price: number;
    sold_summary: number;
    created_at: string | null;
    updated_at: string | null;
}

export interface ItemEarningsStats {
    sum_earned: number;
    author_earned: number;
    sales: number;
}

export interface ItemSalesStats {
    total_sales: number;
    has_item: number;
}

function toNum(value: unknown, fallback = 0): number {
    if (value == null) return fallback;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toIsoStringOrNull(value: unknown): string | null {
    if (value == null || value === "") return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    return String(value);
}

/**
 * Port of `SoldItems::apiCheckPurchaseByCode`:
 *
 * ```sql
 * SELECT sold_items.*, users.name as buyer_name
 * FROM sold_items
 * LEFT JOIN users ON users.id = sold_items.buyer_id
 * WHERE sold_items.status = 1 AND sold_items.purchase_code = ?
 * LIMIT 1
 * ```
 */
export async function apiCheckPurchaseByCode(
    code: string,
): Promise<SoldItemsResource | null> {
    const pool = getPool();
    try {
        const [rows] = await pool.execute<SoldItemPurchaseRow[]>(
            `SELECT sold_items.*, users.name AS buyer_name
             FROM sold_items
             LEFT JOIN users ON users.id = sold_items.buyer_id
             WHERE sold_items.status = 1 AND sold_items.purchase_code = ?
             LIMIT 1`,
            [code],
        );
        const row = rows[0];
        if (!row) return null;
        return {
            buyer_id: toNum(row.buyer_id),
            buyer_name: row.buyer_name ?? null,
            purchase_code: String(row.purchase_code ?? ""),
            license: toNum(row.license),
            item_id: toNum(row.item_id),
            sold_price: toNum(row.sold_price),
            sold_summary: toNum(row.sold_summary),
            created_at: toIsoStringOrNull(row.created_at),
            updated_at: toIsoStringOrNull(row.updated_at),
        };
    } catch (err) {
        console.error("[apiCheckPurchaseByCode] MySQL query failed:", err);
        return null;
    }
}

interface EarningsRow extends RowDataPacket {
    sum_earned: string | number | null;
    author_earned: string | number | null;
    sales: string | number | null;
}

/**
 * Port of `SoldItems::earningsApiStatsByItem`. Window is exclusive on neither
 * side because Laravel uses `whereBetween`, which translates to SQL `BETWEEN`
 * (inclusive on both bounds).
 *
 * Pass both `from` and `to` to scope to a period; pass `null/null` for total.
 */
export async function earningsApiStatsByItem(
    itemId: number,
    from: Date | null = null,
    to: Date | null = null,
): Promise<ItemEarningsStats> {
    const pool = getPool();
    const params: unknown[] = [itemId];
    let sql = `
        SELECT
            TRUNCATE(IFNULL(SUM(IFNULL(author_earn,0) + IFNULL(co_earn,0) + IFNULL(ref_earn,0) + IFNULL(co_ref_earn,0)), 0), 2) AS sum_earned,
            TRUNCATE(IFNULL(SUM(sold_items.author_earn), 0), 2) AS author_earned,
            COUNT(sold_items.id) AS sales
        FROM sold_items
        WHERE sold_items.item_id = ? AND sold_items.status = 1
    `;
    if (from && to) {
        sql += " AND sold_items.created_at BETWEEN ? AND ?";
        params.push(toMysqlDateTime(from), toMysqlDateTime(to));
    }

    try {
        const [rows] = await pool.query<EarningsRow[]>(sql, params);
        const row = rows[0];
        return {
            sum_earned: toNum(row?.sum_earned),
            author_earned: toNum(row?.author_earned),
            sales: toNum(row?.sales),
        };
    } catch (err) {
        console.error("[earningsApiStatsByItem] MySQL query failed:", err);
        return { sum_earned: 0, author_earned: 0, sales: 0 };
    }
}

interface SalesRow extends RowDataPacket {
    total_sales: string | number | null;
    has_item: number | null;
}

/**
 * Port of `SoldItems::salesApiStatsByItem`. `has_item` is `MAX(item_id)` from
 * Laravel — i.e. the row's item_id when at least one match exists, or `null`.
 */
export async function salesApiStatsByItem(
    itemId: number,
    from: Date | null = null,
    to: Date | null = null,
): Promise<ItemSalesStats> {
    const pool = getPool();
    const params: unknown[] = [itemId];
    let sql = `
        SELECT
            COUNT(sold_items.id) AS total_sales,
            MAX(sold_items.item_id) AS has_item
        FROM sold_items
        WHERE sold_items.item_id = ? AND sold_items.status = 1
    `;
    if (from && to) {
        sql += " AND sold_items.created_at BETWEEN ? AND ?";
        params.push(toMysqlDateTime(from), toMysqlDateTime(to));
    }

    try {
        const [rows] = await pool.query<SalesRow[]>(sql, params);
        const row = rows[0];
        return {
            total_sales: toNum(row?.total_sales),
            has_item: toNum(row?.has_item),
        };
    } catch (err) {
        console.error("[salesApiStatsByItem] MySQL query failed:", err);
        return { total_sales: 0, has_item: 0 };
    }
}

function toMysqlDateTime(d: Date): string {
    return d.toISOString().slice(0, 19).replace("T", " ");
}

export const __testing = { toMysqlDateTime };
