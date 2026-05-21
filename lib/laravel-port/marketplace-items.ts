import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

/**
 * Native port of Laravel `App\Models\MarketplaceItem` — only the helpers used
 * by the API routes (`itemExists`, `getItemSimply`, `newestItems`, `bestItems`,
 * `freeItems` + `getItemsWithParamsAndPagination` for joins/aggregations).
 *
 * The Laravel side does not declare `$casts`, so JSON columns
 * (`description_json`, `attributes`, `files`) are returned as raw strings and
 * we keep that contract for binary compatibility with existing consumers.
 */

const TABLE = "marketplace_items";
const RATINGS_TABLE = "item_ratings";
const POPULARITIES_TABLE = "item_popularities";
const USERS_TABLE = "users";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Row returned by `enrichedQuery` — `marketplace_items.*` + joined fields. */
export interface MarketplaceItemApiRow extends RowDataPacket {
    id: number;
    author_id: number;
    access: number;
    price: string | number | null;
    name: string | null;
    index_category_slug: string | null;
    sub_category_slug: string | null;
    description: string | null;
    description_html: string | null;
    description_json: string | null;
    tags: string | null;
    has_qty: number | null;
    attributes: string | null;
    extra: string | null;
    json_args: string | null;
    files: string | null;
    has_demo: number | null;
    demo_url: string | null;
    has_external: number | null;
    external_domain: string | null;
    external_url: string | null;
    youtube_preview: string | null;
    discount_price: string | number | null;
    discount_start: Date | string | null;
    discount_end: Date | string | null;
    team: string | null;
    exclusive: number | null;
    subscription: number | null;
    created_at: Date | string | null;
    updated_at: Date | string | null;
    deleted_at: Date | string | null;
    /* Joined fields — same names Laravel emits via Eloquent serialization. */
    author_name: string | null;
    rate_avg: string | number | null;
    rate_count: string | number | null;
    popular_sum: string | number | null;
    popular_extra_sort_check: string | null;
}

function toIsoOrNull(value: unknown): string | null {
    if (value == null || value === "") return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    return String(value);
}

function toNum(value: unknown, fallback = 0): number {
    if (value == null) return fallback;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toMysqlDateTime(d: Date): string {
    return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Normalize a row so dates are ISO 8601 strings and counters are numbers,
 * matching what Eloquent emitted on the Laravel side.
 */
export function normalizeRow(row: MarketplaceItemApiRow): Record<string, unknown> {
    return {
        ...row,
        access: toNum(row.access, 1),
        author_id: toNum(row.author_id),
        price: row.price == null ? null : toNum(row.price),
        discount_price: row.discount_price == null ? null : toNum(row.discount_price),
        discount_start: toIsoOrNull(row.discount_start),
        discount_end: toIsoOrNull(row.discount_end),
        created_at: toIsoOrNull(row.created_at),
        updated_at: toIsoOrNull(row.updated_at),
        deleted_at: toIsoOrNull(row.deleted_at),
        rate_avg: row.rate_avg == null ? null : toNum(row.rate_avg),
        rate_count: row.rate_count == null ? null : toNum(row.rate_count),
        popular_sum: row.popular_sum == null ? null : toNum(row.popular_sum),
    };
}

/** Port of `MarketplaceItem::itemExists`: any row matching the id. */
export async function itemExists(itemId: number): Promise<boolean> {
    if (!Number.isFinite(itemId)) return false;
    const pool = getPool();
    try {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT 1 FROM \`${TABLE}\` WHERE id = ? LIMIT 1`,
            [itemId],
        );
        return rows.length > 0;
    } catch (err) {
        console.error("[itemExists] MySQL query failed:", err);
        return false;
    }
}

/** Port of `MarketplaceItem::getItemSimply`: full row for given id. */
export async function getItemSimply(itemId: number): Promise<Record<string, unknown> | null> {
    if (!Number.isFinite(itemId)) return null;
    const pool = getPool();
    try {
        const [rows] = await pool.execute<MarketplaceItemApiRow[]>(
            `SELECT * FROM \`${TABLE}\` WHERE id = ? LIMIT 1`,
            [itemId],
        );
        const row = rows[0];
        if (!row) return null;
        const normalized = normalizeRow(row);
        delete (normalized as Record<string, unknown>).author_name;
        delete (normalized as Record<string, unknown>).rate_avg;
        delete (normalized as Record<string, unknown>).rate_count;
        delete (normalized as Record<string, unknown>).popular_sum;
        delete (normalized as Record<string, unknown>).popular_extra_sort_check;
        return normalized;
    } catch (err) {
        console.error("[getItemSimply] MySQL query failed:", err);
        return null;
    }
}

interface EnrichedQueryOptions {
    /**
     * Extra `WHERE` fragment without the leading `AND`. Use placeholders.
     * Example: `marketplace_items.has_external IS NULL`.
     */
    extraWhereSql?: string;
    extraParams?: unknown[];
    /** ORDER BY clause (without `ORDER BY`). Defaults to `marketplace_items.created_at DESC`. */
    orderBy?: string;
    limit?: number;
}

/**
 * Build + run the same query Laravel `getItemsWithParamsAndPagination` ends up
 * producing for the home-page endpoints (no `params['popular']`, default
 * `access = 1`, weekly popularity LEFT JOIN, ratings LEFT JOIN, JOIN users).
 */
async function enrichedQuery({
    extraWhereSql,
    extraParams = [],
    orderBy = `${TABLE}.created_at DESC`,
    limit = 12,
}: EnrichedQueryOptions): Promise<Record<string, unknown>[]> {
    const pool = getPool();
    const cap = Math.min(Math.max(limit, 1), 100);
    const now = new Date();
    const lastWeek = new Date(now.getTime() - ONE_WEEK_MS);

    const ratingsSub = `(
        SELECT item_id, AVG(rate) AS rate_avg, COUNT(*) AS rate_count
        FROM \`${RATINGS_TABLE}\`
        GROUP BY item_id
    )`;

    const popularSub = `(
        SELECT ip.item_id, SUM(ip.ranking) AS ranking_sum
        FROM \`${POPULARITIES_TABLE}\` AS ip
        WHERE ip.created_at BETWEEN ? AND ?
        GROUP BY ip.item_id
    )`;

    const where: string[] = [`${TABLE}.access = 1`];
    if (extraWhereSql) where.push(extraWhereSql);

    const sql = `
        SELECT
            ${TABLE}.*,
            ${USERS_TABLE}.name AS author_name,
            itemRatingsAgg.rate_avg AS rate_avg,
            itemRatingsAgg.rate_count AS rate_count,
            popularItemRanks.ranking_sum AS popular_sum,
            CONCAT('') AS popular_extra_sort_check
        FROM \`${TABLE}\`
        INNER JOIN \`${USERS_TABLE}\` ON ${USERS_TABLE}.id = ${TABLE}.author_id
        LEFT JOIN ${ratingsSub} AS itemRatingsAgg ON itemRatingsAgg.item_id = ${TABLE}.id
        LEFT JOIN ${popularSub} AS popularItemRanks ON popularItemRanks.item_id = ${TABLE}.id
        WHERE ${where.join(" AND ")}
        ORDER BY ${orderBy}
        LIMIT ?
    `;

    const params: unknown[] = [
        toMysqlDateTime(lastWeek),
        toMysqlDateTime(now),
        ...extraParams,
        cap,
    ];

    try {
        const [rows] = await pool.query<MarketplaceItemApiRow[]>(sql, params);
        return rows.map(normalizeRow);
    } catch (err) {
        console.error("[enrichedQuery] MySQL query failed:", err);
        return [];
    }
}

/**
 * Port of `MarketplaceItem::newestItems` (no `category`, no `custom_opt`):
 * default order `created_at DESC`, filters out external items.
 */
export async function newestItems(count = 8): Promise<Record<string, unknown>[]> {
    return enrichedQuery({
        extraWhereSql: `${TABLE}.has_external IS NULL`,
        orderBy: `${TABLE}.created_at DESC`,
        limit: count,
    });
}

/**
 * Port of `MarketplaceItem::bestItems`: hardcoded id list with popularity-first
 * order. Mirrors the Laravel `whereRaw("marketplace_items.id IN (5325,..,5332)")`.
 */
const BEST_ITEM_IDS = [5325, 5326, 5327, 5328, 5329, 5330, 5331, 5332] as const;

export async function bestItems(count = 8): Promise<Record<string, unknown>[]> {
    const placeholders = BEST_ITEM_IDS.map(() => "?").join(",");
    return enrichedQuery({
        extraWhereSql: `${TABLE}.id IN (${placeholders})`,
        extraParams: [...BEST_ITEM_IDS],
        orderBy: `popular_sum DESC, rate_avg DESC`,
        limit: count,
    });
}

/** Port of `MarketplaceItem::freeItems`: `price = 0`. */
export async function freeItems(count = 4): Promise<Record<string, unknown>[]> {
    return enrichedQuery({
        extraWhereSql: `${TABLE}.price = 0`,
        orderBy: `${TABLE}.created_at DESC`,
        limit: count,
    });
}
