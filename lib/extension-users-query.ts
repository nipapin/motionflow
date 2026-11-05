import { soldItemAccessCondition } from "@/lib/campaigns/core.mjs";
import { DEFAULT_EXTENSION_USER_FILTERS, mailingFilterSql, type ExtensionUserFilters } from "@/lib/user-list-filters";
import type { TableViewState } from "@/lib/table-query";
import { tableOrderSql, tableWhereSql, type SqlTableColumns } from "@/lib/table-query-sql";
import { packagesProjectsTableName } from "@/lib/packages-authors-db";

export function activeAuthorSubscriptionSql(alias = "ss"): string {
  const end = `GREATEST(COALESCE(${alias}.ends_at, '1970-01-01'), COALESCE(${alias}.paddle_billing_period_ends_at, '1970-01-01'))`;
  return `((${alias}.status = 1 AND ((${alias}.ends_at IS NULL AND ${alias}.paddle_billing_period_ends_at IS NULL) OR ${end} > NOW())) OR (${alias}.status = -1 AND ${end} > NOW()))`;
}

/** One shared SQL selection for the author list, count and CSV (before pagination). */
export function buildExtensionUsersQuery(opts: { authorId: number; client: string | null; q?: string; filters?: Partial<ExtensionUserFilters>; tableView?: TableViewState; tableFacet?: string }) {
  if (!Number.isSafeInteger(opts.authorId) || opts.authorId <= 0) throw new Error("Invalid author ID");
  const filters = { ...DEFAULT_EXTENSION_USER_FILTERS, ...opts.filters };
  const unionParts = [
    "SELECT buyer_id AS user_id FROM subscription_systems WHERE author_id = ?",
    `SELECT buyer_id AS user_id FROM sold_items WHERE author_id = ? AND ${soldItemAccessCondition()}`,
  ];
  const params: (string | number)[] = [opts.authorId, opts.authorId];
  if (opts.client) {
    unionParts.unshift("SELECT user_id FROM cep_devices WHERE client = ? AND revoked_at IS NULL");
    params.unshift(opts.client);
  }
  let lastSeenJoin = "LEFT JOIN (SELECT NULL AS user_id, NULL AS last_seen_at, 0 AS device_count) ls ON 1=0";
  if (opts.client) {
    lastSeenJoin = `LEFT JOIN (
      SELECT user_id, MAX(COALESCE(last_seen_at, created_at)) AS last_seen_at, COUNT(*) AS device_count
      FROM cep_devices WHERE client = ? AND revoked_at IS NULL GROUP BY user_id
    ) ls ON ls.user_id = u.id`;
    params.push(opts.client);
  }
  const clauses: string[] = [];
  const q = opts.q?.trim();
  if (q) {
    clauses.push("(u.email LIKE ? OR u.name LIKE ? OR CAST(u.id AS CHAR) = ?)");
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    params.push(like, like, q);
  }
  const activeSub = `SELECT ss.id FROM subscription_systems ss WHERE ss.buyer_id = u.id AND ss.author_id = ${opts.authorId} AND ${activeAuthorSubscriptionSql()} ORDER BY ss.id DESC LIMIT 1`;
  const sourceSql = `(SELECT CASE WHEN LOWER(ss.system) = 'admin' THEN 'admin' ELSE 'paddle' END FROM subscription_systems ss WHERE ss.id = (${activeSub}))`;
  const columns: SqlTableColumns = {
    user: { sql: "CONCAT_WS(' ', NULLIF(u.name, ''), u.email, CONCAT('user_', u.id))" },
    subscription: { sql: `CASE WHEN EXISTS (${activeSub}) THEN 'Active' ELSE 'None' END` },
    devices: { sql: "COALESCE(ls.device_count, 0)", kind: "number" },
    packs: { sql: `(SELECT COUNT(*) FROM (SELECT id, marketplace_item_id, price, admin_only FROM \`${packagesProjectsTableName()}\` WHERE author_id=${opts.authorId} AND visible=1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 500) pp
      WHERE COALESCE(pp.admin_only,0)=0 AND (COALESCE(pp.price,0)<=0 OR EXISTS (${activeSub}) OR EXISTS (SELECT 1 FROM sold_items si WHERE si.buyer_id=u.id AND si.item_id IN (pp.id, pp.marketplace_item_id) AND ${soldItemAccessCondition("si")})))`, kind: "number" },
    errors: { sql: opts.client ? `(SELECT COUNT(*) FROM cep_error_reports er JOIN cep_devices ed ON ed.id=er.device_id WHERE ed.user_id=u.id AND ed.revoked_at IS NULL AND ed.client=${getSqlString(opts.client)})` : "0", kind: "number" },
    last_seen: { sql: "ls.last_seen_at", kind: "date" },
  };
  if (filters.sub === "active") clauses.push(`EXISTS (${activeSub})`);
  if (filters.sub === "none") clauses.push(`NOT EXISTS (${activeSub})`);
  if (filters.source !== "all") {
    clauses.push(`${sourceSql} = ?`);
    params.push(filters.source);
  }
  const purchase = `EXISTS (SELECT 1 FROM sold_items si WHERE si.buyer_id = u.id AND si.author_id = ${opts.authorId} AND ${soldItemAccessCondition("si")})`;
  if (filters.sold === "has") clauses.push(purchase);
  if (filters.sold === "none") clauses.push(`NOT ${purchase}`);
  if (filters.devices === "has") clauses.push("COALESCE(ls.device_count, 0) > 0");
  if (filters.devices === "none") clauses.push("COALESCE(ls.device_count, 0) = 0");
  const mailing = mailingFilterSql(filters.mailing);
  if (mailing) clauses.push(mailing);
  if (filters.verified === "verified") clauses.push("u.email_verified_at IS NOT NULL");
  if (filters.verified === "unverified") clauses.push("u.email_verified_at IS NULL");
  for (const [field, from, to] of [
    ["u.created_at", filters.registeredFrom, filters.registeredTo],
    ["ls.last_seen_at", filters.seenFrom, filters.seenTo],
  ]) {
    if (from) { clauses.push(`${field} >= ?`); params.push(`${from} 00:00:00`); }
    if (to) { clauses.push(`${field} < DATE_ADD(?, INTERVAL 1 DAY)`); params.push(to); }
  }
  const table = tableWhereSql(opts.tableView, columns, opts.tableFacet);
  if (table.sql) { clauses.push(table.sql); params.push(...table.params); }
  return {
    fromSql: `FROM (${unionParts.join(" UNION ")}) e JOIN users u ON u.id = e.user_id ${lastSeenJoin} WHERE ${clauses.length ? clauses.join(" AND ") : "1=1"}`,
    params,
    sourceSql,
    columns,
    orderSql: tableOrderSql(opts.tableView, columns, "ORDER BY (ls.last_seen_at IS NULL) ASC, ls.last_seen_at DESC, u.id DESC"),
  };
}

function getSqlString(value: string) {
  // Client identifiers come from the server registry, never the request.
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("Invalid client");
  return `'${value}'`;
}
