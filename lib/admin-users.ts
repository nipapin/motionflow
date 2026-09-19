import "server-only";

import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { getExtraBalance, adminApplyCreditChanges } from "@/lib/user-generation-credits";
import {
  EXTRA_GEN_PACKS,
  isExtraGenerationsPackPriceId,
} from "@/lib/extra-generation-packs";
import { PREMIERE_GAL_AUTHOR_ID } from "@/lib/premiere-gal-paddle-config";
import { SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";
import {
  ADMIN_USERS_PAGE_SIZE,
  type AdminUserDetail,
  type AdminUserGoogleFilter,
  type AdminUserListRow,
  type AdminUserRoleFilter,
  type AdminUserSoldFilter,
  type AdminUserSortDir,
  type AdminUserSortField,
  type AdminUserSubFilter,
  type AdminUserVerifiedFilter,
} from "@/lib/admin-users-shared";
import type { AdminUserPatchInput } from "@/lib/validations/admin-users";

const USERS_TABLE = "users";
const SOLD_TABLE = "sold_items";
const SUB_TABLE = "subscription_systems";

export class AdminUserConflictError extends Error {
  constructor(
    message: string,
    readonly field: "name" | "email",
  ) {
    super(message);
    this.name = "AdminUserConflictError";
  }
}

function likeContains(q: string): string {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}

function likePrefix(q: string): string {
  return `${q.replace(/[\\%_]/g, "\\$&")}%`;
}

function toIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toStrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function roleFilterSql(role: AdminUserRoleFilter): string {
  if (role === "buyer") return "(u.access = 0 OR u.access IS NULL)";
  if (role === "partner") return "u.access = 1";
  if (role === "author") return "(u.access >= 2 AND u.access != 100)";
  if (role === "admin") return "u.access = 100";
  return "";
}

function googleFilterSql(google: AdminUserGoogleFilter): string {
  if (google === "linked") return "(u.google_id IS NOT NULL AND u.google_id != '')";
  if (google === "none") return "(u.google_id IS NULL OR u.google_id = '')";
  return "";
}

function verifiedFilterSql(verified: AdminUserVerifiedFilter): string {
  if (verified === "verified") return "u.email_verified_at IS NOT NULL";
  if (verified === "unverified") return "u.email_verified_at IS NULL";
  return "";
}

function extraPackExcludeSql(): string {
  const ids = EXTRA_GEN_PACKS.map((p) => p.priceId).filter(
    (id): id is string => Boolean(id) && /^[A-Za-z0-9_]+$/.test(id),
  );
  if (ids.length === 0) return "";
  return ` AND (ss.paddle_price_id IS NULL OR ss.paddle_price_id NOT IN (${ids
    .map((id) => `'${id}'`)
    .join(",")}))`;
}

/** Matches `isSubscriptionRowActive` for list filters and sort. */
function activeSubscriptionPredicate(alias = "ss"): string {
  return `(
    (
      ${alias}.status = 1
      AND (
        (${alias}.ends_at IS NULL AND ${alias}.paddle_billing_period_ends_at IS NULL)
        OR GREATEST(
             COALESCE(${alias}.ends_at, '1970-01-01'),
             COALESCE(${alias}.paddle_billing_period_ends_at, '1970-01-01')
           ) > NOW()
      )
    )
    OR (
      ${alias}.status = -1
      AND (${alias}.ends_at IS NOT NULL OR ${alias}.paddle_billing_period_ends_at IS NOT NULL)
      AND GREATEST(
            COALESCE(${alias}.ends_at, '1970-01-01'),
            COALESCE(${alias}.paddle_billing_period_ends_at, '1970-01-01')
          ) > NOW()
    )
  )`;
}

function soldFilterSql(sold: AdminUserSoldFilter): string {
  if (sold === "has") {
    return `EXISTS (SELECT 1 FROM \`${SOLD_TABLE}\` si WHERE si.buyer_id = u.id AND si.status = 1)`;
  }
  if (sold === "none") {
    return `NOT EXISTS (SELECT 1 FROM \`${SOLD_TABLE}\` si WHERE si.buyer_id = u.id AND si.status = 1)`;
  }
  return "";
}

function activeSubscriptionExistsSql(): string {
  return `EXISTS (
    SELECT 1 FROM \`${SUB_TABLE}\` ss
     WHERE ss.buyer_id = u.id
       AND ${activeSubscriptionPredicate("ss")}
       ${extraPackExcludeSql()}
  )`;
}

function subFilterSql(sub: AdminUserSubFilter): string {
  if (sub === "active") return activeSubscriptionExistsSql();
  if (sub === "none") return `NOT ${activeSubscriptionExistsSql()}`;
  return "";
}

const SORT_SQL: Record<AdminUserSortField, string> = {
  id: "u.id",
  name: "LOWER(u.name)",
  email: "LOWER(u.email)",
  access: "u.access",
  soldItems: `(SELECT COUNT(*) FROM \`${SOLD_TABLE}\` si WHERE si.buyer_id = u.id AND si.status = 1)`,
  subscription: `(SELECT COUNT(*) FROM \`${SUB_TABLE}\` ss WHERE ss.buyer_id = u.id AND ${activeSubscriptionPredicate("ss")}${extraPackExcludeSql()})`,
  createdAt: "u.created_at",
};

export async function searchAdminUsers(opts: {
  q?: string;
  page?: number;
  role?: AdminUserRoleFilter;
  google?: AdminUserGoogleFilter;
  verified?: AdminUserVerifiedFilter;
  sold?: AdminUserSoldFilter;
  subscription?: AdminUserSubFilter;
  registeredFrom?: string | null;
  registeredTo?: string | null;
  sort?: AdminUserSortField;
  dir?: AdminUserSortDir;
}): Promise<{ users: AdminUserListRow[]; total: number; page: number; pageSize: number }> {
  const q = (opts.q ?? "").trim();
  const role: AdminUserRoleFilter = opts.role ?? "all";
  const google: AdminUserGoogleFilter = opts.google ?? "all";
  const verified: AdminUserVerifiedFilter = opts.verified ?? "all";
  const sold: AdminUserSoldFilter = opts.sold ?? "all";
  const subscription: AdminUserSubFilter = opts.subscription ?? "all";
  const registeredFrom = opts.registeredFrom ?? null;
  const registeredTo = opts.registeredTo ?? null;
  const sort: AdminUserSortField = opts.sort ?? "id";
  const dir: AdminUserSortDir = opts.dir ?? "desc";
  const pageSize = ADMIN_USERS_PAGE_SIZE;
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const asId = Number(q);
  const isNumericId = /^\d+$/.test(q) && Number.isFinite(asId) && asId > 0;
  const hasQuery = q.length > 0;
  const searchCodes = hasQuery && (q.length >= 4 || isNumericId);

  const pool = getPool();
  const offset = (page - 1) * pageSize;
  const clauses: string[] = [];
  const whereParams: Array<string | number> = [];

  const roleSql = roleFilterSql(role);
  if (roleSql) clauses.push(roleSql);
  const googleSql = googleFilterSql(google);
  if (googleSql) clauses.push(googleSql);
  const verifiedSql = verifiedFilterSql(verified);
  if (verifiedSql) clauses.push(verifiedSql);
  const soldSql = soldFilterSql(sold);
  if (soldSql) clauses.push(soldSql);
  const subSql = subFilterSql(subscription);
  if (subSql) clauses.push(subSql);
  if (registeredFrom) {
    clauses.push("u.created_at >= ?");
    whereParams.push(`${registeredFrom} 00:00:00`);
  }
  if (registeredTo) {
    clauses.push("u.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
    whereParams.push(registeredTo);
  }

  if (hasQuery) {
    const contains = likeContains(q);
    const prefix = likePrefix(q);
    const searchParts: string[] = [
      ...(isNumericId ? ["u.id = ?"] : []),
      "u.name LIKE ? ESCAPE '\\\\'",
      "u.email LIKE ? ESCAPE '\\\\'",
      "u.first_name LIKE ? ESCAPE '\\\\'",
      "u.last_name LIKE ? ESCAPE '\\\\'",
      "u.google_id LIKE ? ESCAPE '\\\\'",
      "u.company_name LIKE ? ESCAPE '\\\\'",
      "u.city LIKE ? ESCAPE '\\\\'",
      "u.country LIKE ? ESCAPE '\\\\'",
      "u.subscription_id LIKE ? ESCAPE '\\\\'",
      "u.last_payment_id LIKE ? ESCAPE '\\\\'",
      "u.referred_by_campaign LIKE ? ESCAPE '\\\\'",
    ];
    if (isNumericId) whereParams.push(asId);
    whereParams.push(
      contains,
      contains,
      contains,
      contains,
      contains,
      contains,
      contains,
      contains,
      prefix,
      prefix,
      contains,
    );
    if (searchCodes) {
      searchParts.push(`EXISTS (
        SELECT 1 FROM \`${SOLD_TABLE}\` si
         WHERE si.buyer_id = u.id
           AND (si.purchase_code = ? OR si.purchase_code LIKE ? ESCAPE '\\\\')
      )`);
      searchParts.push(`EXISTS (
        SELECT 1 FROM \`${SUB_TABLE}\` ss
         WHERE ss.buyer_id = u.id
           AND (
             ss.subscription_id = ?
             OR ss.payment_id = ?
             OR ss.subscription_id LIKE ? ESCAPE '\\\\'
             OR ss.payment_id LIKE ? ESCAPE '\\\\'
           )
      )`);
      whereParams.push(q, prefix, q, q, prefix, prefix);
    }
    clauses.push(`(${searchParts.join(" OR ")})`);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const dirSql = dir === "asc" ? "ASC" : "DESC";
  const useSearchRelevance = hasQuery && sort === "id" && dir === "desc";
  const orderSql = useSearchRelevance
    ? `ORDER BY
        CASE
          WHEN u.id = ? THEN 0
          WHEN LOWER(u.email) = LOWER(?) THEN 1
          WHEN LOWER(u.name) = LOWER(?) THEN 2
          ELSE 3
        END,
        u.id DESC`
    : `ORDER BY ${SORT_SQL[sort]} ${dirSql}, u.id ${dirSql}`;
  const orderParams: Array<string | number> = useSearchRelevance
    ? [isNumericId ? asId : -1, q, q]
    : [];

  async function exec<T extends RowDataPacket[]>(
    sql: string,
    params: Array<string | number>,
  ): Promise<T> {
    const [rows] = params.length
      ? await pool.execute<T>(sql, params)
      : await pool.execute<T>(sql);
    return rows;
  }

  type CountRow = RowDataPacket & { total: number };
  const countRows = await exec<CountRow[]>(
    `SELECT COUNT(*) AS total FROM \`${USERS_TABLE}\` u ${whereSql}`,
    whereParams,
  );
  const total = Number(countRows[0]?.total ?? 0);

  type ListRow = RowDataPacket & {
    id: number;
    name: string;
    email: string;
    access: number | null;
    created_at: string | Date | null;
  };
  const rows = await exec<ListRow[]>(
    `SELECT u.id, u.name, u.email, u.access, u.created_at
       FROM \`${USERS_TABLE}\` u
       ${whereSql}
       ${orderSql}
      LIMIT ${pageSize} OFFSET ${offset}`,
    [...whereParams, ...orderParams],
  );

  const users = rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name ?? ""),
    email: String(r.email ?? ""),
    access: Number(r.access ?? 0),
    createdAt: toIso(r.created_at),
    soldItemsCount: 0,
    activeSubscription: null as string | null,
  }));

  await attachListEntitlements(users);

  return {
    users,
    total,
    page,
    pageSize,
  };
}

function subscriptionListLabel(row: {
  author_id: number | null;
  paddle_product_name: string | null;
  plan: string | null;
}): string {
  const authorId = row.author_id == null ? null : Number(row.author_id);
  if (authorId === SPUNKRAM_AUTHOR_ID) {
    return row.paddle_product_name?.trim() || "Spunkram";
  }
  if (authorId === PREMIERE_GAL_AUTHOR_ID) {
    return row.paddle_product_name?.trim() || "Premiere Gal";
  }
  const name = row.paddle_product_name?.trim();
  if (name) return name.startsWith("Motionflow") ? name : `Motionflow ${name}`;
  if (row.plan) return `Motionflow (${row.plan})`;
  return "Motionflow";
}

function isSubscriptionRowActive(
  status: number,
  endsAt: unknown,
  billingEnd: unknown,
): boolean {
  const a = toIso(endsAt);
  const b = toIso(billingEnd);
  const later = !a ? b : !b ? a : new Date(a) >= new Date(b) ? a : b;
  if (status === -1) {
    return Boolean(later && new Date(later) > new Date());
  }
  if (status === 1) {
    return !later || new Date(later) > new Date();
  }
  return false;
}

async function attachListEntitlements(users: AdminUserListRow[]): Promise<void> {
  if (users.length === 0) return;
  const ids = users.map((u) => u.id);
  const placeholders = ids.map(() => "?").join(",");
  const pool = getPool();

  type SoldCountRow = RowDataPacket & { buyer_id: number; n: number };
  const [soldRows] = await pool.execute<SoldCountRow[]>(
    `SELECT buyer_id, COUNT(*) AS n
       FROM \`${SOLD_TABLE}\`
      WHERE status = 1 AND buyer_id IN (${placeholders})
      GROUP BY buyer_id`,
    ids,
  );
  const soldByBuyer = new Map(soldRows.map((r) => [Number(r.buyer_id), Number(r.n)]));

  type SubRow = RowDataPacket & {
    buyer_id: number;
    author_id: number | null;
    status: number;
    plan: string | null;
    paddle_product_name: string | null;
    paddle_price_id: string | null;
    ends_at: string | Date | null;
    paddle_billing_period_ends_at: string | Date | null;
  };
  const [subRows] = await pool.execute<SubRow[]>(
    `SELECT buyer_id, author_id, status, plan, paddle_product_name, paddle_price_id,
            ends_at, paddle_billing_period_ends_at
       FROM \`${SUB_TABLE}\`
      WHERE buyer_id IN (${placeholders}) AND status IN (1, -1)
      ORDER BY id DESC`,
    ids,
  );

  const labelsByBuyer = new Map<number, string[]>();
  for (const r of subRows) {
    if (isExtraGenerationsPackPriceId(r.paddle_price_id?.trim())) continue;
    if (!isSubscriptionRowActive(Number(r.status), r.ends_at, r.paddle_billing_period_ends_at)) {
      continue;
    }
    const buyerId = Number(r.buyer_id);
    const label = subscriptionListLabel(r);
    const list = labelsByBuyer.get(buyerId) ?? [];
    if (!list.includes(label)) list.push(label);
    labelsByBuyer.set(buyerId, list);
  }

  for (const user of users) {
    user.soldItemsCount = soldByBuyer.get(user.id) ?? 0;
    const labels = labelsByBuyer.get(user.id);
    user.activeSubscription = labels && labels.length > 0 ? labels.join(", ") : null;
  }
}

export async function getAdminUserById(id: number): Promise<AdminUserDetail | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const pool = getPool();
  type Row = RowDataPacket & {
    id: number;
    name: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    access: number | null;
    mailing: number | null;
    google_id: string | null;
    email_verified_at: string | Date | null;
    created_at: string | Date | null;
    balance: number | null;
  };
  const [rows] = await pool.execute<Row[]>(
    `SELECT id, name, email, first_name, last_name, access, mailing, google_id,
            email_verified_at, created_at, balance
       FROM \`${USERS_TABLE}\`
      WHERE id = ?
      LIMIT 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;

  let extraGenerations = 0;
  try {
    extraGenerations = await getExtraBalance(id);
  } catch (err) {
    console.warn("[admin-users] extra generations lookup failed", err);
  }

  const mailing = r.mailing == null ? null : Number(r.mailing);
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    email: String(r.email ?? ""),
    firstName: toStrNull(r.first_name),
    lastName: toStrNull(r.last_name),
    access: Number(r.access ?? 0),
    mailing,
    mailingOptIn: mailing === 0,
    googleId: toStrNull(r.google_id),
    emailVerifiedAt: toIso(r.email_verified_at),
    createdAt: toIso(r.created_at),
    balance: Number(r.balance ?? 0),
    extraGenerations,
  };
}

export async function updateAdminUser(
  id: number,
  patch: AdminUserPatchInput,
  opts?: { adminUserId?: number },
): Promise<AdminUserDetail> {
  const existing = await getAdminUserById(id);
  if (!existing) {
    throw new Error("NOT_FOUND");
  }

  const pool = getPool();
  const sets: string[] = [];
  const params: Array<string | number | null> = [];

  if (patch.name !== undefined && patch.name !== existing.name) {
    const [taken] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM \`${USERS_TABLE}\` WHERE name = ? AND id != ? LIMIT 1`,
      [patch.name, id],
    );
    if (taken.length > 0) {
      throw new AdminUserConflictError("NAME_TAKEN", "name");
    }
    sets.push("name = ?");
    params.push(patch.name);
  }

  if (patch.email !== undefined && patch.email !== existing.email.toLowerCase()) {
    const [taken] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM \`${USERS_TABLE}\` WHERE LOWER(email) = ? AND id != ? LIMIT 1`,
      [patch.email, id],
    );
    if (taken.length > 0) {
      throw new AdminUserConflictError("EMAIL_TAKEN", "email");
    }
    sets.push("email = ?");
    params.push(patch.email);
  }

  if (patch.firstName !== undefined) {
    sets.push("first_name = ?");
    params.push(patch.firstName);
  }
  if (patch.lastName !== undefined) {
    sets.push("last_name = ?");
    params.push(patch.lastName);
  }
  if (patch.access !== undefined) {
    sets.push("access = ?");
    params.push(patch.access);
  }
  if (patch.mailingOptIn !== undefined) {
    sets.push("mailing = ?");
    params.push(patch.mailingOptIn ? 0 : null);
  }
  if (patch.newPassword) {
    sets.push("password = ?");
    params.push(await bcrypt.hash(patch.newPassword, 10));
  }

  if (sets.length > 0) {
    sets.push("updated_at = NOW()");
    await pool.execute<ResultSetHeader>(
      `UPDATE \`${USERS_TABLE}\` SET ${sets.join(", ")} WHERE id = ?`,
      [...params, id],
    );
  }

  if (patch.extraGenerations !== undefined) {
    const result = await adminApplyCreditChanges({
      userId: id,
      setExtraBalance: patch.extraGenerations,
      note: opts?.adminUserId
        ? `admin_users patch by ${opts.adminUserId}`
        : "admin_users patch",
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
  }

  const updated = await getAdminUserById(id);
  if (!updated) throw new Error("NOT_FOUND");
  return updated;
}
