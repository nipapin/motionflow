import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";

export const ADMIN_DB_SEARCH_PAGE_SIZE = 40;

export type AdminSearchType =
  | "users"
  | "market_items"
  | "followings"
  | "favorites"
  | "popularities"
  | "ratings"
  | "payouts"
  | "sold_items"
  | "click_counters"
  | "view_counters"
  | "coupons"
  | "short_links"
  | "subscriptions";

type SearchConfig = {
  title: string;
  table: string;
  select: string[];
  defSelect: string[];
};

function ident(q: string): string | null {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(q) ? q : null;
}

function tick(table: string): string {
  return table.split(".").length > 1 ? table : `\`${table.replace(/`/g, "")}\``;
}

function buildConfigs(): Record<AdminSearchType, SearchConfig> {
  const mi = marketplaceItemsTable();
  return {
    users: {
      title: "Users",
      table: "users",
      select: [
        "id",
        "name",
        "email",
        "first_name",
        "last_name",
        "country",
        "access",
        "balance",
        "extra_tax",
        "awards",
        "created_at",
      ],
      defSelect: ["id", "name", "email"],
    },
    market_items: {
      title: "Items",
      table: mi,
      select: [
        "id",
        "author_id",
        "exclusive",
        "subscription",
        "team",
        "access",
        "price",
        "name",
        "index_category_slug",
        "extra",
        "created_at",
      ],
      defSelect: ["id", "name", "author_id"],
    },
    followings: {
      title: "Followings",
      table: "user_followings",
      select: ["id", "user_id", "following_id", "created_at"],
      defSelect: ["id", "user_id", "following_id"],
    },
    favorites: {
      title: "Favorites",
      table: "user_favorites",
      select: ["id", "user_id", "item_id", "created_at"],
      defSelect: ["id", "user_id", "item_id"],
    },
    popularities: {
      title: "Popularities",
      table: "item_popularities",
      select: ["id", "item_id", "valuer_id", "ranking", "created_at"],
      defSelect: ["id", "item_id", "valuer_id"],
    },
    ratings: {
      title: "Item ratings",
      table: "item_ratings",
      select: ["id", "item_id", "buyer_id", "rate", "created_at"],
      defSelect: ["id", "item_id", "buyer_id"],
    },
    payouts: {
      title: "Payouts",
      table: "payouts",
      select: ["id", "recipient_id", "status", "amount", "sold_amount", "subs_amount", "method", "created_at"],
      defSelect: ["id", "recipient_id", "status"],
    },
    sold_items: {
      title: "Sold items",
      table: "sold_items",
      select: [
        "id",
        "buyer_id",
        "author_id",
        "item_id",
        "status",
        "license",
        "qty",
        "sold_price",
        "sold_summary",
        "author_earn",
        "payment_id",
        "system",
      ],
      defSelect: ["id", "author_id", "buyer_id", "item_id"],
    },
    click_counters: {
      title: "Click counters",
      table: "clicks_counters",
      select: ["id", "assigned_id", "type", "method", "clicks", "created_at"],
      defSelect: ["assigned_id", "type", "method", "clicks"],
    },
    view_counters: {
      title: "View counters",
      table: "views_counters",
      select: ["id", "assigned_id", "type", "views", "created_at"],
      defSelect: ["assigned_id", "type", "views"],
    },
    coupons: {
      title: "Coupons",
      table: "coupon_services",
      select: [
        "id",
        "author_id",
        "assigned_id",
        "status",
        "code",
        "type",
        "amount",
        "start_date",
        "end_date",
        "uses",
        "max_uses",
      ],
      defSelect: ["author_id", "code", "type", "max_uses"],
    },
    short_links: {
      title: "Short links",
      table: "short_links",
      select: ["id", "link", "bind_id", "redirect", "views", "comment", "created_at"],
      defSelect: ["link", "bind_id", "redirect"],
    },
    subscriptions: {
      title: "Subscriptions",
      table: "subscription_systems",
      select: [
        "id",
        "buyer_id",
        "status",
        "amount",
        "amount_summary",
        "price",
        "payment_id",
        "subscription_id",
        "type",
        "plan",
        "count",
        "ends_at",
      ],
      defSelect: ["buyer_id", "status", "type", "plan", "count"],
    },
  };
}

export function adminSearchTypeList(): Array<{ id: AdminSearchType; title: string }> {
  const c = buildConfigs();
  return (Object.keys(c) as AdminSearchType[]).map((id) => ({ id, title: c[id].title }));
}

export type AdminDbSearchInput = {
  searchType: string;
  searchQuery: string;
  searchLike: boolean;
  searchSelectCols: string;
  searchOrderBy: string;
  page: number;
};

export type AdminDbSearchResult = {
  ok: true;
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  config: SearchConfig;
  searchType: AdminSearchType;
} | {
  ok: false;
  error: string;
};

export async function runAdminDbSearch(input: AdminDbSearchInput): Promise<AdminDbSearchResult> {
  const configs = buildConfigs();
  const searchType = input.searchType as AdminSearchType;
  if (!configs[searchType]) {
    return { ok: false, error: "Invalid search type" };
  }

  const cfg = configs[searchType];
  const pool = getPool();
  const tableSql = tick(cfg.table);

  void input.searchSelectCols;

  const validatedCols = cfg.select.map((c) => ident(c)).filter(Boolean) as string[];
  if (validatedCols.length === 0) {
    return { ok: false, error: "No columns" };
  }

  const selectList = validatedCols.map((c) => `\`${c}\``).join(", ");

  const rawQ = input.searchQuery.trim();
  let customCol: string | null = null;
  let customVal = "";
  if (rawQ.includes(":")) {
    const idx = rawQ.indexOf(":");
    customCol = ident(rawQ.slice(0, idx).trim());
    customVal = rawQ.slice(idx + 1).trim();
    if (!customCol || !cfg.select.includes(customCol)) {
      return { ok: false, error: "Unknown column in key:value query" };
    }
  }

  const params: (string | number | null)[] = [];
  let whereSql = "";

  if (customCol) {
    if (input.searchLike) {
      const like = `%${customVal.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      params.push(like);
      whereSql = `WHERE CAST(\`${customCol}\` AS CHAR) LIKE ? ESCAPE '\\\\'`;
    } else {
      params.push(customVal);
      whereSql = `WHERE CAST(\`${customCol}\` AS CHAR) = ?`;
    }
  } else if (rawQ.length > 0) {
    const parts: string[] = [];
    for (const col of cfg.defSelect) {
      const ic = ident(col);
      if (!ic || !cfg.select.includes(ic)) continue;
      if (input.searchLike) {
        const like = `%${rawQ.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
        params.push(like);
        parts.push(`CAST(\`${ic}\` AS CHAR) LIKE ? ESCAPE '\\\\'`);
      } else {
        params.push(rawQ);
        parts.push(`CAST(\`${ic}\` AS CHAR) = ?`);
      }
    }
    if (parts.length) {
      whereSql = `WHERE (${parts.join(" OR ")})`;
    }
  }

  const orderCol = cfg.select.includes("id") ? "id" : validatedCols[0];
  let orderSql = ` ORDER BY \`${orderCol}\` DESC`;
  const ob = input.searchOrderBy.trim();
  if (ob && ob.includes("-")) {
    const [colRaw, dirRaw] = ob.split("-");
    const col = ident(colRaw.trim());
    const dir = dirRaw?.toLowerCase() === "asc" ? "ASC" : "DESC";
    if (col && cfg.select.includes(col)) {
      orderSql = ` ORDER BY \`${col}\` ${dir}`;
    }
  }

  const pNum = Number(input.page);
  const page = Number.isFinite(pNum) && pNum >= 1 ? Math.floor(pNum) : 1;
  const offset = (page - 1) * ADMIN_DB_SEARCH_PAGE_SIZE;

  const countSql = `SELECT COUNT(*) AS c FROM ${tableSql} ${whereSql}`;
  const dataSql = `SELECT ${selectList} FROM ${tableSql} ${whereSql}${orderSql} LIMIT ${ADMIN_DB_SEARCH_PAGE_SIZE} OFFSET ${offset}`;

  try {
    const [countRows] = await pool.execute<RowDataPacket[]>(countSql, params);
    const total = Number(countRows[0]?.c ?? 0);
    const [rows] = await pool.execute<RowDataPacket[]>(dataSql, params);
    const out = rows.map((r) => ({ ...r }) as Record<string, unknown>);
    return {
      ok: true,
      rows: out,
      total,
      page,
      pageSize: ADMIN_DB_SEARCH_PAGE_SIZE,
      config: cfg,
      searchType,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Query failed";
    return { ok: false, error: msg };
  }
}
