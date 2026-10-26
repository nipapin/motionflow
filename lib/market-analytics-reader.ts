import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { ensureMarketAnalyticsSchema } from "@/lib/market-analytics-schema";
import type { HeatPage, HeatReport, MarketFilters, MarketOverview, MarketAction } from "@/lib/market-analytics-shared";
import { MARKET_ACTIONS } from "@/lib/market-analytics-shared";

const sqlText = (expression: string) => `CAST(${expression} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci`;
const dateText = (expression: string) => `DATE_FORMAT(${expression},'%Y-%m-%d %H:%i:%s')`;
const itemTable = () => /^[a-zA-Z0-9_]+$/.test(process.env.DB_MARKET_ITEMS_TABLE || "") ? process.env.DB_MARKET_ITEMS_TABLE! : "marketplace_items";

export function parseMarketFilters(params: URLSearchParams): MarketFilters | null {
  const today = new Date().toISOString().slice(0, 10);
  const from = params.get("from") || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const to = params.get("to") || today;
  const valid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
  const action = params.get("action"), source = params.get("source"), type = params.get("resourceType"), id = params.get("resourceId");
  const page = Number(params.get("page") || 1), search = params.get("search") || undefined, sort = params.get("sort") || "downloads";
  const scope = params.get("scope");
  if (!valid(from) || !valid(to) || from > to || to > today || Date.parse(to) - Date.parse(from) > 365 * 86400000 ||
    (action && !MARKET_ACTIONS.includes(action as MarketAction)) || (source && !["web", "extension", "unknown"].includes(source)) ||
    Boolean(type) !== Boolean(id) || (type && !/^[a-z_]{1,32}$/.test(type)) || (id && id.length > 191) ||
    !Number.isInteger(page) || page < 1 || page > 10000 || (search && search.length > 100) ||
    !["downloads", "purchases", "views", "selections", "favorites", "generations", "extensions", "users", "lastAt"].includes(sort) ||
    (scope && !["market", "extensions", "ai"].includes(scope))) return null;
  return { from, to, action: action as MarketAction || undefined, source: source as MarketFilters["source"] || undefined,
    resourceType: type || undefined, resourceId: id || undefined, page, search, sort, scope: scope as MarketFilters["scope"] || undefined };
}

/** Every source is date-bounded before the union; paid purchases come from the payment ledger, never browser events. */
async function eventQuery(filters: MarketFilters) {
  await ensureMarketAnalyticsSchema();
  const [tableRows] = await getPool().execute<(RowDataPacket & { name: string })[]>(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('market_events','user_activity','subscription_downloads','generation_records','sold_items','packages_projects')");
  const tables = new Set(tableRows.map(row => row.name));
  const params: (string | number)[] = [], parts: string[] = [], unavailableSources: string[] = [];
  const branch = (table: string, prefix: string, fields: { user: string; action: string; detail: string; status: string; type: string; resource: string; name: string; source: string; at: string }, where = "1=1") => {
    if (!tables.has(table)) { unavailableSources.push(table); return; }
    const f = fields;
    parts.push(`SELECT CONCAT('${prefix}',${table}.id) AS id, ${f.user} AS user_id,
      ${sqlText(f.action)} AS action, ${sqlText(f.detail)} AS detail, ${sqlText(f.status)} AS status,
      ${sqlText(f.type)} AS resource_type, ${sqlText(f.resource)} AS resource_id,
      ${sqlText(f.name)} AS resource_name, ${sqlText(f.source)} AS source, ${f.at} AS at
      FROM ${table} WHERE ${f.at}>=? AND ${f.at}<DATE_ADD(?,INTERVAL 1 DAY) AND (${where})`);
    params.push(filters.from, filters.to);
  };
  branch("market_events", "market:", { user: "user_id", action: "action", detail: "action", status: "'observed'", type: "resource_type", resource: "resource_id", name: "NULL", source: "source", at: "created_at" }, "resource_type<>'page'");
  branch("user_activity", "activity:", { user: "user_id", action: "CASE category WHEN 'download' THEN 'download' WHEN 'generation' THEN 'generation' ELSE 'extension' END", detail: "action", status: "status", type: "resource_type", resource: "COALESCE(resource_id,LEFT(resource_name,191),'unidentified')", name: "resource_name", source: "source", at: "created_at" });
  branch("subscription_downloads", "download:", { user: "user_id", action: "'download'", detail: "'marketplace_download'", status: "'unknown'", type: "'marketplace_item'", resource: "item_id", name: "NULL", source: "'unknown'", at: "created_at" },
    tables.has("user_activity") ? "NOT EXISTS (SELECT 1 FROM user_activity a WHERE a.legacy_download_id=subscription_downloads.id)" : "1=1");
  branch("generation_records", "generation:", { user: "user_id", action: "'generation'", detail: "'generation'", status: "status", type: "'tool'", resource: "tool", name: "NULL", source: "CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(settings,'$._activity_source')) IN ('web','extension') THEN JSON_UNQUOTE(JSON_EXTRACT(settings,'$._activity_source')) WHEN JSON_UNQUOTE(JSON_EXTRACT(settings,'$.source')) LIKE 'cep-%' THEN 'extension' ELSE 'unknown' END", at: "created_at" });
  branch("sold_items", "purchase:", { user: "buyer_id", action: "'purchase'", detail: "'paid_purchase'", status: "'paid'", type: "'marketplace_item'", resource: "item_id", name: "NULL", source: "'unknown'", at: "created_at" }, "status=1 AND sold_price>0 AND `system` NOT IN ('campaign','admin','gift')");
  let sql = `FROM (${parts.join(" UNION ALL ")}) e
    LEFT JOIN \`${itemTable()}\` item ON e.resource_type='marketplace_item' AND item.id=e.resource_id
    ${tables.has("packages_projects") ? "LEFT JOIN packages_projects pack ON e.resource_type='extension_pack' AND pack.id=e.resource_id" : ""}
    LEFT JOIN users u ON u.id=e.user_id WHERE 1=1`;
  if (filters.action) { sql += " AND e.action=?"; params.push(filters.action); }
  if (filters.source) { sql += " AND e.source=?"; params.push(filters.source); }
  if (filters.scope === "market") sql += " AND e.resource_type='marketplace_item'";
  if (filters.scope === "extensions") sql += " AND (e.resource_type IN ('extension_pack','effect_file') OR e.action='extension')";
  if (filters.scope === "ai") sql += " AND e.action='generation'";
  if (filters.resourceType && filters.resourceId) { sql += " AND e.resource_type=? AND e.resource_id=?"; params.push(filters.resourceType, filters.resourceId); }
  const name = `COALESCE(item.name,${tables.has("packages_projects") ? "pack.name," : ""}e.resource_name,e.resource_id,'Unknown material')`;
  if (filters.search) {
    sql += ` AND (${name} LIKE ? OR u.name LIKE ? OR u.email LIKE ?)`;
    const search = `%${filters.search.replace(/[\\%_]/g, char => `\\${char}`)}%`; params.push(search, search, search);
  }
  return { sql, params, name, unavailableSources };
}
const count = (action: string) => `SUM(CASE WHEN e.action='${action}' AND e.status NOT IN ('failed','requested') THEN 1 ELSE 0 END)`;

export async function readMarketOverview(filters: MarketFilters): Promise<MarketOverview> {
  const { sql, params, name, unavailableSources } = await eventQuery(filters);
  const pool = getPool(), actions = MARKET_ACTIONS.map(action => `${count(action)} AS \`${action}\``).join(",");
  const resources = `SELECT e.resource_type AS type,e.resource_id AS id,MAX(${name}) AS name,
    ${count("view")} AS views,${count("select")} AS selections,${count("favorite")} AS favorites,
    ${count("download")} AS downloads,${count("purchase")} AS purchases,${count("generation")} AS generations,
    ${count("extension")} AS extensions,COUNT(DISTINCT e.user_id) AS users,${dateText("MAX(e.at)")} AS lastAt
    ${sql} GROUP BY e.resource_type,e.resource_id`;
  const queries = [
    `SELECT ${actions},COUNT(DISTINCT e.user_id) AS users,SUM(e.status='failed') AS failures ${sql}`,
    `SELECT DATE_FORMAT(e.at,'%Y-%m-%d') AS day,${actions} ${sql} GROUP BY DATE(e.at) ORDER BY DATE(e.at)`,
    `SELECT * FROM (${resources}) r ORDER BY \`${filters.sort || "downloads"}\` DESC,type,id LIMIT 50 OFFSET ${(filters.page - 1) * 50}`,
    `SELECT COUNT(*) AS total FROM (${resources}) r`,
    `SELECT e.id,e.action,e.detail,e.status,e.resource_type AS resourceType,e.resource_id AS resourceId,${name} AS resourceName,
      e.user_id AS userId,u.name AS userName,u.email AS userEmail,e.source,${dateText("e.at")} AS at
      ${sql} ORDER BY e.at DESC,e.id DESC LIMIT 50 OFFSET ${(filters.page - 1) * 50}`,
    `SELECT COUNT(*) AS total ${sql}`,
    `SELECT e.user_id AS id,MAX(COALESCE(u.name,IF(e.user_id IS NULL,'Anonymous visitors','Deleted account'))) AS name,
      MAX(u.email) AS email,COUNT(*) AS actions,${count("download")} AS downloads,${count("purchase")} AS purchases,
      ${dateText("MAX(e.at)")} AS lastAt ${sql} GROUP BY e.user_id ORDER BY actions DESC LIMIT 50`,
  ];
  const results = await Promise.all(queries.map(query => pool.execute<RowDataPacket[]>(query, params).then(([rows]) => rows)));
  const totals = Object.fromEntries([...MARKET_ACTIONS, "users", "failures"].map(key => [key, Number(results[0][0]?.[key] || 0)])) as MarketOverview["totals"];
  const numbers = (rows: RowDataPacket[], fields: string[]) => rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, fields.includes(key) ? Number(value || 0) : value])));
  const byDay = new Map(results[1].map(row => [row.day, row]));
  const daily: MarketOverview["daily"] = [];
  for (let time = Date.parse(filters.from); time <= Date.parse(filters.to); time += 86400000) {
    const day = new Date(time).toISOString().slice(0, 10), values = byDay.get(day);
    daily.push({ day, ...Object.fromEntries(MARKET_ACTIONS.map(action => [action, Number(values?.[action] || 0)])) } as MarketOverview["daily"][number]);
  }
  return {
    totals, daily,
    resources: numbers(results[2], ["views", "selections", "favorites", "downloads", "purchases", "generations", "extensions", "users"]) as MarketOverview["resources"],
    resourceTotal: Number(results[3][0].total), events: numbers(results[4], []) as MarketOverview["events"], eventTotal: Number(results[5][0].total),
    users: numbers(results[6], ["actions", "downloads", "purchases"]) as MarketOverview["users"],
    page: filters.page, pageSize: 50, unavailableSources,
  };
}

export async function readMarketHeatmap(from: string, to: string, path?: string, width?: number, layout?: string): Promise<HeatReport> {
  await ensureMarketAnalyticsSchema();
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT path,viewport_width AS width,layout,COUNT(*) AS visits,
    ${dateText("MIN(created_at)")} AS firstAt,${dateText("MAX(created_at)")} AS lastAt FROM market_heatmap_visits
    WHERE day>=? AND day<=?
    GROUP BY path,viewport_width,layout ORDER BY visits DESC LIMIT 500`, [from, to]);
  const pages = rows.map(row => ({ ...row, width: Number(row.width), visits: Number(row.visits) })) as HeatPage[];
  const selected = path ? pages.find(page => page.path === path && page.width === width && page.layout === layout) || null : pages[0] || null;
  if (!selected) return { pages, selected: null, cells: [], visits: 0, scroll: [] };
  const args = [from, to, selected.path, selected.width, selected.layout];
  const [[cells], [visits]] = await Promise.all([
    pool.execute<RowDataPacket[]>(`SELECT x,y,kind,SUM(weight) AS weight FROM market_heatmap_cells
      WHERE day>=? AND day<=? AND path=? AND viewport_width=? AND layout=? GROUP BY x,y,kind`, args),
    pool.execute<RowDataPacket[]>(`SELECT max_scroll AS depth,COUNT(*) AS visits FROM market_heatmap_visits
      WHERE day>=? AND day<=? AND path=? AND viewport_width=? AND layout=? GROUP BY max_scroll`, args),
  ]);
  return { pages, selected, cells: cells.map(row => ({ x: Number(row.x), y: Number(row.y), kind: row.kind, weight: Number(row.weight) })),
    visits: selected.visits, scroll: [25, 50, 75, 100].map(depth => ({ depth, visits: visits.filter(row => Number(row.depth) >= depth).reduce((sum, row) => sum + Number(row.visits), 0) })) };
}
