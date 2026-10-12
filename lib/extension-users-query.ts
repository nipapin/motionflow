import { soldItemAccessCondition } from "@/lib/campaigns/core.mjs";
import { DEFAULT_EXTENSION_USER_FILTERS, mailingFilterSql, type ExtensionUserFilters } from "@/lib/user-list-filters";

export function activeAuthorSubscriptionSql(alias = "ss"): string {
  const end = `GREATEST(COALESCE(${alias}.ends_at, '1970-01-01'), COALESCE(${alias}.paddle_billing_period_ends_at, '1970-01-01'))`;
  return `((${alias}.status = 1 AND ((${alias}.ends_at IS NULL AND ${alias}.paddle_billing_period_ends_at IS NULL) OR ${end} > NOW())) OR (${alias}.status = -1 AND ${end} > NOW()))`;
}

/** One shared SQL selection for the author list, count and CSV (before pagination). */
export function buildExtensionUsersQuery(opts: { authorId: number; client: string | null; q?: string; filters?: Partial<ExtensionUserFilters> }) {
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
  return {
    fromSql: `FROM (${unionParts.join(" UNION ")}) e JOIN users u ON u.id = e.user_id ${lastSeenJoin} ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}`,
    params,
    sourceSql,
    orderSql: "ORDER BY (ls.last_seen_at IS NULL) ASC, ls.last_seen_at DESC, u.id DESC",
  };
}
