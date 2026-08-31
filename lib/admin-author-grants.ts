import "server-only";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import {
  generatePasswordResetToken,
  storePasswordResetToken,
} from "@/lib/auth/password-reset";
import { sendAuthorAccessInviteEmail } from "@/lib/auth/password-reset-mailer";
import { formatAuthorSubscriptionLabel } from "@/lib/author-subscription-label";
import { getActiveAuthorSubscription } from "@/lib/cep-entitlements";
import { getPackagesAuthorById } from "@/lib/packages-admin";
import {
  listVisiblePackagesProjects,
  type PackagesProjectDto,
} from "@/lib/packages-projects";
import { getOwnedItemIdSet } from "@/lib/purchases";
import {
  PREMIERE_GAL_AUTHOR_ID,
  PREMIERE_GAL_PRICE_IDS,
  type PremiereGalPlanId,
} from "@/lib/premiere-gal-paddle-config";
import {
  SPUNKRAM_AUTHOR_ID,
  SPUNKRAM_AI_TOOLKIT_SUBSCRIPTION_PRICE_IDS,
  SPUNKRAM_LIBRARY_SUBSCRIPTION_PRICE_IDS,
  type SpunkramSubscriptionTierId,
} from "@/lib/spunkram-paddle-config";

const SUB_TABLE = "subscription_systems";
const SOLD_TABLE = "sold_items";
const USERS_TABLE = "users";
const ADMIN_SYSTEM = "admin";

export type AdminGrantDuration = "until_revoked" | "1_month" | "1_year";

export type AdminSpunkramSubscriptionGrant = {
  kind: "spunkram";
  tier: Extract<SpunkramSubscriptionTierId, "library" | "ai_toolkit">;
  duration: AdminGrantDuration;
};

export type AdminPremiereGalSubscriptionGrant = {
  kind: "premiere_gal";
  plan: PremiereGalPlanId;
};

export type AdminSubscriptionGrant =
  | AdminSpunkramSubscriptionGrant
  | AdminPremiereGalSubscriptionGrant;

export type AuthorAccessSnapshot = {
  user_id: number;
  email: string;
  name: string;
  exists: true;
  subscription_active: boolean;
  subscription_label: string | null;
  subscription_source: "admin" | "paddle" | "none";
  subscription_plan: string | null;
  subscription_tier: SpunkramSubscriptionTierId | null;
  subscription_ends_at: string | null;
  owned_pack_ids: number[];
  owned_packs: Array<{
    pack_id: number;
    name: string;
    host: string | null;
    source: "admin" | "paddle" | "unknown";
  }>;
};

export type AuthorAccessLookupMissing = {
  exists: false;
  email: string;
};

export type AuthorAccessLookupResult =
  | AuthorAccessSnapshot
  | AuthorAccessLookupMissing;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function adminPaymentId(): string {
  return `admin_${crypto.randomUUID().replace(/-/g, "")}`;
}

function generatePurchaseCode(
  itemId: number,
  buyerId: number,
  paymentId: string,
): string {
  return crypto
    .createHash("md5")
    .update(`order${itemId}${buyerId}${paymentId}`)
    .digest("hex");
}

function endsAtForDuration(duration: AdminGrantDuration): Date | null {
  if (duration === "until_revoked") return null;
  const d = new Date();
  if (duration === "1_month") {
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d;
  }
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

function toMysqlDateTime(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function spunkramCatalog(opts: {
  tier: "library" | "ai_toolkit";
  duration: AdminGrantDuration;
}): { priceId: string; productName: string; plan: string } {
  const useYearly = opts.duration !== "1_month";
  if (opts.tier === "ai_toolkit") {
    return {
      priceId: useYearly
        ? SPUNKRAM_AI_TOOLKIT_SUBSCRIPTION_PRICE_IDS.yearly
        : SPUNKRAM_AI_TOOLKIT_SUBSCRIPTION_PRICE_IDS.monthly,
      productName: "Editor AI",
      plan: useYearly ? "annual" : "monthly",
    };
  }
  return {
    priceId: useYearly
      ? SPUNKRAM_LIBRARY_SUBSCRIPTION_PRICE_IDS.yearly
      : SPUNKRAM_LIBRARY_SUBSCRIPTION_PRICE_IDS.monthly,
    productName: "Editor",
    plan: useYearly ? "annual" : "monthly",
  };
}

function premiereGalCatalog(plan: PremiereGalPlanId): {
  priceId: string;
  productName: string;
  plan: string;
} {
  return {
    priceId: PREMIERE_GAL_PRICE_IDS[plan],
    productName: "Gal Toolkit MAX",
    plan,
  };
}

export async function lookupUsersByEmailOrName(opts: {
  q: string;
  limit?: number;
}): Promise<Array<{ id: number; email: string; name: string }>> {
  const q = opts.q.trim();
  if (q.length < 3) return [];
  const limit = Math.min(20, Math.max(1, opts.limit ?? 10));
  const pool = getPool();
  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
  type Row = RowDataPacket & { id: number; email: string; name: string };
  const [rows] = await pool.execute<Row[]>(
    `SELECT id, email, name FROM \`${USERS_TABLE}\`
     WHERE email LIKE ? OR name LIKE ?
     ORDER BY
       CASE WHEN LOWER(email) = LOWER(?) THEN 0
            WHEN LOWER(email) LIKE LOWER(?) THEN 1
            ELSE 2 END,
       id DESC
     LIMIT ${limit}`,
    [like, like, q, `${q}%`],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    email: String(r.email),
    name: String(r.name ?? ""),
  }));
}

async function ownedPacksForAuthor(
  userId: number,
  authorId: number,
  projects: PackagesProjectDto[],
): Promise<AuthorAccessSnapshot["owned_packs"]> {
  const lookupIds = projects.flatMap((p) => {
    const ids = [p.id];
    if (p.marketplace_item_id != null) ids.push(p.marketplace_item_id);
    return ids;
  });
  const ownedIds = await getOwnedItemIdSet(userId, lookupIds);
  const pool = getPool();

  type SoldRow = RowDataPacket & {
    item_id: number;
    system: string | null;
  };
  const [soldRows] =
    lookupIds.length === 0
      ? ([[] as SoldRow[]] as const)
      : await pool.execute<SoldRow[]>(
          `SELECT item_id, \`system\` FROM \`${SOLD_TABLE}\`
           WHERE buyer_id = ? AND status = 1 AND author_id = ?
             AND item_id IN (${lookupIds.map(() => "?").join(",")})`,
          [userId, authorId, ...lookupIds],
        );

  const sourceByItem = new Map<number, "admin" | "paddle" | "unknown">();
  for (const r of soldRows as SoldRow[]) {
    const itemId = Number(r.item_id);
    const system = String(r.system ?? "").toLowerCase();
    const source =
      system === ADMIN_SYSTEM
        ? "admin"
        : system === "paddle"
          ? "paddle"
          : "unknown";
    sourceByItem.set(itemId, source);
  }

  const out: AuthorAccessSnapshot["owned_packs"] = [];
  for (const project of projects) {
    if (project.admin_only) continue;
    const owned =
      ownedIds.has(project.id) ||
      (project.marketplace_item_id != null &&
        ownedIds.has(project.marketplace_item_id));
    if (!owned) continue;
    const source =
      sourceByItem.get(project.id) ??
      (project.marketplace_item_id != null
        ? sourceByItem.get(project.marketplace_item_id)
        : undefined) ??
      "unknown";
    out.push({
      pack_id: project.id,
      name: project.name,
      host: project.host,
      source,
    });
  }
  return out;
}

async function subscriptionSourceForUser(
  userId: number,
  authorId: number,
): Promise<"admin" | "paddle" | "none"> {
  const pool = getPool();
  type Row = RowDataPacket & { system: string | null; status: number };
  const [rows] = await pool.execute<Row[]>(
    `SELECT \`system\`, status FROM \`${SUB_TABLE}\`
     WHERE buyer_id = ? AND author_id = ?
     ORDER BY id DESC LIMIT 5`,
    [userId, authorId],
  );
  for (const r of rows) {
    if (Number(r.status) !== 1 && Number(r.status) !== -1) continue;
    const system = String(r.system ?? "").toLowerCase();
    if (system === ADMIN_SYSTEM) return "admin";
    if (system) return "paddle";
  }
  return rows.length > 0 ? "paddle" : "none";
}

export async function getAuthorAccessSnapshot(opts: {
  authorId: number;
  userId: number;
}): Promise<AuthorAccessSnapshot | null> {
  const pool = getPool();
  type UserRow = RowDataPacket & { id: number; email: string; name: string };
  const [userRows] = await pool.execute<UserRow[]>(
    `SELECT id, email, name FROM \`${USERS_TABLE}\` WHERE id = ? LIMIT 1`,
    [opts.userId],
  );
  const user = userRows[0];
  if (!user) return null;

  const [subscription, projects, source] = await Promise.all([
    getActiveAuthorSubscription(opts.userId, opts.authorId),
    listVisiblePackagesProjects(opts.authorId),
    subscriptionSourceForUser(opts.userId, opts.authorId),
  ]);
  const owned_packs = await ownedPacksForAuthor(
    opts.userId,
    opts.authorId,
    projects,
  );
  const label = formatAuthorSubscriptionLabel({
    authorId: opts.authorId,
    active: subscription.active,
    plan: subscription.plan,
    productName: subscription.plan,
    priceId: null,
    tierId: subscription.tierId,
  });

  return {
    user_id: Number(user.id),
    email: String(user.email),
    name: String(user.name ?? ""),
    exists: true,
    subscription_active: subscription.active,
    subscription_label: label,
    subscription_source: subscription.active ? source : "none",
    subscription_plan: subscription.plan,
    subscription_tier: subscription.tierId,
    subscription_ends_at: subscription.renews_at,
    owned_pack_ids: owned_packs.map((p) => p.pack_id),
    owned_packs,
  };
}

export async function lookupAuthorAccessByEmail(opts: {
  authorId: number;
  email: string;
}): Promise<AuthorAccessLookupResult> {
  const email = normalizeEmail(opts.email);
  const pool = getPool();
  type UserRow = RowDataPacket & { id: number };
  const [rows] = await pool.execute<UserRow[]>(
    `SELECT id FROM \`${USERS_TABLE}\` WHERE LOWER(email) = ? LIMIT 1`,
    [email],
  );
  const user = rows[0];
  if (!user) return { exists: false, email };

  const snap = await getAuthorAccessSnapshot({
    authorId: opts.authorId,
    userId: Number(user.id),
  });
  if (!snap) return { exists: false, email };
  return snap;
}

async function uniqueUsername(base: string): Promise<string> {
  const pool = getPool();
  let candidate = base.slice(0, 40) || "user";
  candidate = candidate.replace(/[^a-zA-Z0-9._-]/g, "_") || "user";
  for (let i = 0; i < 20; i++) {
    const name = i === 0 ? candidate : `${candidate}${i + 1}`.slice(0, 50);
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM \`${USERS_TABLE}\` WHERE name = ? LIMIT 1`,
      [name],
    );
    if (rows.length === 0) return name;
  }
  return `${candidate}_${crypto.randomBytes(3).toString("hex")}`;
}

export async function createInvitedUserForAuthorGrant(opts: {
  email: string;
  authorLabel: string;
  siteOrigin?: string;
}): Promise<{ userId: number; email: string; name: string; invited: true }> {
  const email = normalizeEmail(opts.email);
  if (!email.includes("@")) {
    throw new Error("INVALID_EMAIL");
  }
  const pool = getPool();
  const [existing] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM \`${USERS_TABLE}\` WHERE LOWER(email) = ? LIMIT 1`,
    [email],
  );
  if (existing.length > 0) {
    throw new Error("EMAIL_TAKEN");
  }

  const local = email.split("@")[0] || "user";
  const name = await uniqueUsername(local);
  const passwordHash = await bcrypt.hash(
    crypto.randomBytes(24).toString("hex"),
    10,
  );

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO \`${USERS_TABLE}\`
       (name, email, password, mailing, email_verified_at, created_at, updated_at)
     VALUES (?, ?, ?, 0, NOW(), NOW(), NOW())`,
    [name, email, passwordHash],
  );
  const userId = Number(result.insertId);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error("USER_CREATE_FAILED");
  }

  const token = generatePasswordResetToken();
  await storePasswordResetToken(email, token);
  await sendAuthorAccessInviteEmail({
    email,
    token,
    name,
    authorLabel: opts.authorLabel,
    siteOrigin: opts.siteOrigin,
  });

  return { userId, email, name, invited: true };
}

export async function grantAdminAuthorSubscription(opts: {
  userId: number;
  authorId: number;
  grant: AdminSubscriptionGrant;
}): Promise<{ subscriptionId: string; updated: boolean }> {
  const { userId, authorId, grant } = opts;
  if (grant.kind === "spunkram" && authorId !== SPUNKRAM_AUTHOR_ID) {
    throw new Error("BAD_GRANT_AUTHOR");
  }
  if (grant.kind === "premiere_gal" && authorId !== PREMIERE_GAL_AUTHOR_ID) {
    throw new Error("BAD_GRANT_AUTHOR");
  }

  const catalog =
    grant.kind === "spunkram"
      ? spunkramCatalog({ tier: grant.tier, duration: grant.duration })
      : premiereGalCatalog(grant.plan);

  const endsAt =
    grant.kind === "spunkram"
      ? toMysqlDateTime(endsAtForDuration(grant.duration))
      : grant.plan === "lifetime"
        ? null
        : toMysqlDateTime(
            endsAtForDuration(grant.plan === "monthly" ? "1_month" : "1_year"),
          );

  const pool = getPool();
  type Existing = RowDataPacket & { id: number; subscription_id: string };
  const [existing] = await pool.execute<Existing[]>(
    `SELECT id, subscription_id FROM \`${SUB_TABLE}\`
     WHERE buyer_id = ? AND author_id = ? AND \`system\` = ?
       AND status IN (1, -1)
     ORDER BY id DESC LIMIT 1`,
    [userId, authorId, ADMIN_SYSTEM],
  );

  if (existing[0]) {
    await pool.execute(
      `UPDATE \`${SUB_TABLE}\`
          SET status = 1,
              plan = ?,
              paddle_price_id = ?,
              paddle_product_name = ?,
              ends_at = ?,
              paddle_billing_period_ends_at = ?,
              updated_at = NOW()
        WHERE id = ?`,
      [
        catalog.plan,
        catalog.priceId || null,
        catalog.productName,
        endsAt,
        endsAt,
        existing[0].id,
      ],
    );
    return {
      subscriptionId: String(existing[0].subscription_id),
      updated: true,
    };
  }

  const paymentId = adminPaymentId();
  const subscriptionId = paymentId;
  await pool.execute(
    `INSERT INTO \`${SUB_TABLE}\`
       (buyer_id, subscription_id, payment_id, status,
        amount, amount_summary, price, system_tax,
        \`system\`, type, plan, paddle_price_id, paddle_product_name,
        count, ends_at, paddle_billing_period_ends_at,
        author_id, author_earn, created_at, updated_at)
     VALUES (?, ?, ?, 1, 0, 0, 0, 0, ?, 'personal', ?, ?, ?, 1, ?, ?, ?, 0, NOW(), NOW())`,
    [
      userId,
      subscriptionId,
      paymentId,
      ADMIN_SYSTEM,
      catalog.plan,
      catalog.priceId || null,
      catalog.productName,
      endsAt,
      endsAt,
      authorId,
    ],
  );
  return { subscriptionId, updated: false };
}

export async function revokeAdminAuthorSubscription(opts: {
  userId: number;
  authorId: number;
}): Promise<{ revoked: boolean }> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE \`${SUB_TABLE}\`
        SET status = 0, updated_at = NOW()
      WHERE buyer_id = ? AND author_id = ? AND \`system\` = ? AND status IN (1, -1)`,
    [opts.userId, opts.authorId, ADMIN_SYSTEM],
  );
  return { revoked: (result.affectedRows ?? 0) > 0 };
}

function resolveSoldItemId(project: PackagesProjectDto): number {
  return project.marketplace_item_id != null && project.marketplace_item_id > 0
    ? project.marketplace_item_id
    : project.id;
}

export async function grantAdminAuthorPacks(opts: {
  userId: number;
  authorId: number;
  packIds: number[];
}): Promise<{ granted: number[]; skipped: number[] }> {
  const projects = await listVisiblePackagesProjects(opts.authorId);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const granted: number[] = [];
  const skipped: number[] = [];
  const pool = getPool();

  for (const packId of opts.packIds) {
    const project = byId.get(packId);
    if (!project || project.admin_only) {
      skipped.push(packId);
      continue;
    }
    const itemId = resolveSoldItemId(project);
    const [dup] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM \`${SOLD_TABLE}\`
       WHERE buyer_id = ? AND item_id = ? AND status = 1 LIMIT 1`,
      [opts.userId, itemId],
    );
    if (dup.length > 0) {
      skipped.push(packId);
      continue;
    }
    if (itemId !== project.id) {
      const [dupProj] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM \`${SOLD_TABLE}\`
         WHERE buyer_id = ? AND item_id = ? AND status = 1 LIMIT 1`,
        [opts.userId, project.id],
      );
      if (dupProj.length > 0) {
        skipped.push(packId);
        continue;
      }
    }

    const paymentId = adminPaymentId();
    const purchaseCode = generatePurchaseCode(itemId, opts.userId, paymentId);
    await pool.execute(
      `INSERT INTO \`${SOLD_TABLE}\`
         (buyer_id, author_id, item_id, status, payment_id,
          sold_price, sold_summary, sold_net, license, qty, \`system\`, system_tax,
          arguments, platform_earn, purchase_code, author_earn,
          created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, 0, 0, 0, 1, 1, ?, 0, ?, 0, ?, 0, NOW(), NOW())`,
      [
        opts.userId,
        opts.authorId,
        itemId,
        paymentId,
        ADMIN_SYSTEM,
        JSON.stringify({ source: "admin_grant", pack_id: project.id }),
        purchaseCode,
      ],
    );
    granted.push(packId);
  }

  return { granted, skipped };
}

export async function revokeAdminAuthorPacks(opts: {
  userId: number;
  authorId: number;
  packIds: number[];
}): Promise<{ revoked: number[] }> {
  const projects = await listVisiblePackagesProjects(opts.authorId);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const revoked: number[] = [];
  const pool = getPool();

  for (const packId of opts.packIds) {
    const project = byId.get(packId);
    if (!project) continue;
    const itemIds = [project.id];
    if (project.marketplace_item_id != null) {
      itemIds.push(project.marketplace_item_id);
    }
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE \`${SOLD_TABLE}\`
          SET status = 0, updated_at = NOW()
        WHERE buyer_id = ? AND author_id = ? AND \`system\` = ? AND status = 1
          AND item_id IN (${itemIds.map(() => "?").join(",")})`,
      [opts.userId, opts.authorId, ADMIN_SYSTEM, ...itemIds],
    );
    if ((result.affectedRows ?? 0) > 0) revoked.push(packId);
  }
  return { revoked };
}

export async function applyAuthorAccessGrant(opts: {
  authorId: number;
  email: string;
  createIfMissing: boolean;
  subscription?: AdminSubscriptionGrant | null;
  revokeSubscription?: boolean;
  packIds?: number[];
  revokePackIds?: number[];
  siteOrigin?: string;
}): Promise<{
  userId: number;
  email: string;
  name: string;
  created: boolean;
  invited: boolean;
  snapshot: AuthorAccessSnapshot;
}> {
  const author = await getPackagesAuthorById(opts.authorId);
  if (!author) throw new Error("AUTHOR_NOT_FOUND");

  const email = normalizeEmail(opts.email);
  let created = false;
  let invited = false;
  let userId: number;
  let name: string;

  const lookup = await lookupAuthorAccessByEmail({
    authorId: opts.authorId,
    email,
  });

  if (!lookup.exists) {
    if (!opts.createIfMissing) throw new Error("USER_NOT_FOUND");
    const createdUser = await createInvitedUserForAuthorGrant({
      email,
      authorLabel: author.label,
      siteOrigin: opts.siteOrigin,
    });
    userId = createdUser.userId;
    name = createdUser.name;
    created = true;
    invited = true;
  } else {
    userId = lookup.user_id;
    name = lookup.name;
  }

  if (opts.revokeSubscription) {
    await revokeAdminAuthorSubscription({
      userId,
      authorId: opts.authorId,
    });
  } else if (opts.subscription) {
    await grantAdminAuthorSubscription({
      userId,
      authorId: opts.authorId,
      grant: opts.subscription,
    });
  }

  if (opts.revokePackIds?.length) {
    await revokeAdminAuthorPacks({
      userId,
      authorId: opts.authorId,
      packIds: opts.revokePackIds,
    });
  }
  if (opts.packIds?.length) {
    await grantAdminAuthorPacks({
      userId,
      authorId: opts.authorId,
      packIds: opts.packIds,
    });
  }

  const snapshot = await getAuthorAccessSnapshot({
    authorId: opts.authorId,
    userId,
  });
  if (!snapshot) throw new Error("SNAPSHOT_FAILED");

  return {
    userId,
    email,
    name: snapshot.name || name,
    created,
    invited,
    snapshot,
  };
}
