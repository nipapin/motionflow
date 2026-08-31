import "server-only";

import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { parseDeviceId, revokeDevice } from "@/lib/cep-auth";
import { CEP_CLIENT_SESSIONS_TABLE } from "@/lib/cep-client-sessions";
import {
  listInstallsForDevices,
  type CepDeviceInstallPack,
} from "@/lib/cep-device-installs";
import { listActivePacksForDevices } from "@/lib/cep-device-active-packs";
import {
  countErrorsForDevices,
  listRecentErrorsForDevices,
  type CepErrorReportSummary,
} from "@/lib/cep-error-reports";
import { getCepClientByAuthorId } from "@/lib/cep-client-registry";
import { getActiveAuthorSubscription } from "@/lib/cep-entitlements";
import { formatAuthorSubscriptionLabel } from "@/lib/author-subscription-label";
import { getOwnedItemIdSet } from "@/lib/purchases";
import {
  listVisiblePackagesProjects,
  type PackagesProjectDto,
} from "@/lib/packages-projects";
import { ensurePackagesProjectsTable } from "@/lib/packages-authors-db";
import { getCepDevicesOnlineMap } from "@/lib/cep-presence";
import {
  resolveSpunkramSubscriptionTierId,
  SPUNKRAM_AUTHOR_ID,
} from "@/lib/spunkram-paddle-config";

const DEVICES_TABLE = "cep_devices";
const SUB_TABLE = "subscription_systems";
const SOLD_TABLE = "sold_items";
const PAGE_SIZE = 50;

export type ExtensionDeviceDto = {
  device_id: string;
  device_name: string | null;
  ip: string | null;
  user_fingerprint: string | null;
  client: string;
  created_at: string;
  last_seen_at: string | null;
  online: boolean;
  host_app_id: string | null;
  host_app_name: string | null;
  host_version: string | null;
  os: string | null;
  extension_version: string | null;
  packs: CepDeviceInstallPack[];
  error_count: number;
  recent_errors: CepErrorReportSummary[];
};

export type ExtensionUserGroupDto = {
  user_id: number;
  email: string;
  name: string;
  /** Newest last_seen among this user's devices. */
  last_seen_at: string | null;
  device_count: number;
  online_count: number;
  devices: ExtensionDeviceDto[];
  /** Entitled packs: one-time purchase, subscription, or free. */
  acquired_count: number;
  subscription_active: boolean;
  subscription_label: string | null;
  subscription_source: "admin" | "paddle" | "none";
};

export type ListExtensionUsersResult = {
  client: string | null;
  extension_name: string | null;
  users: ExtensionUserGroupDto[];
  page: number;
  page_size: number;
  /** Distinct entitled users (devices, subscriptions, or purchases). */
  total: number;
  /** Active devices across the current page of users (for UI hints). */
  device_total: number;
};

type DeviceListRow = RowDataPacket & {
  id: number;
  user_id: number;
  email: string;
  name: string;
  device_name: string | null;
  ip: string | null;
  user_fingerprint: string | null;
  client: string;
  created_at: string | Date;
  last_seen_at: string | Date | null;
};

function toIso(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function lastSeenMs(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export type ExtensionPackAccessSource =
  | "purchase"
  | "subscription"
  | "free";

export type ExtensionOwnedPackDto = {
  pack_id: number;
  name: string;
  host: string | null;
  catalog_version: string | null;
  access: ExtensionPackAccessSource;
};

function ownershipLookupIdsForProjects(
  projects: PackagesProjectDto[],
): number[] {
  const ids: number[] = [];
  for (const p of projects) {
    ids.push(p.id);
    if (p.marketplace_item_id != null) ids.push(p.marketplace_item_id);
  }
  return ids;
}

/**
 * Entitled packs for one user: one-time buy, active author subscription, or free.
 * Shared by list acquired_count and the packs modal.
 */
export function buildEntitledPacks(opts: {
  projects: PackagesProjectDto[];
  ownedIds: Set<number>;
  subscriptionActive: boolean;
}): ExtensionOwnedPackDto[] {
  const purchased: ExtensionOwnedPackDto[] = [];
  for (const project of opts.projects) {
    if (project.admin_only) continue;
    const owned =
      (project.marketplace_item_id != null &&
        opts.ownedIds.has(project.marketplace_item_id)) ||
      opts.ownedIds.has(project.id);
    const price = Number(project.price) || 0;
    const isFree = price <= 0;

    let access: ExtensionPackAccessSource | null = null;
    if (owned) access = "purchase";
    else if (opts.subscriptionActive) access = "subscription";
    else if (isFree) access = "free";

    if (!access) continue;
    purchased.push({
      pack_id: project.id,
      name: project.name,
      host: project.host,
      catalog_version: project.version,
      access,
    });
  }
  purchased.sort((a, b) => a.name.localeCompare(b.name));
  return purchased;
}

/**
 * Batch: owned sold_items.item_id per buyer among the page of users.
 */
async function loadOwnedItemIdsByUser(
  userIds: number[],
  itemIds: number[],
): Promise<Map<number, Set<number>>> {
  const out = new Map<number, Set<number>>();
  for (const id of userIds) out.set(id, new Set());
  const uniqueUsers = [...new Set(userIds.filter((id) => id > 0))];
  const uniqueItems = [
    ...new Set(itemIds.filter((id) => Number.isFinite(id) && id > 0)),
  ];
  if (uniqueUsers.length === 0 || uniqueItems.length === 0) return out;

  const pool = getPool();
  const userPh = uniqueUsers.map(() => "?").join(",");
  const itemPh = uniqueItems.map(() => "?").join(",");
  type Row = RowDataPacket & { buyer_id: number; item_id: number };
  const [rows] = await pool.execute<Row[]>(
    `SELECT DISTINCT buyer_id, item_id FROM \`${SOLD_TABLE}\`
     WHERE status = 1
       AND buyer_id IN (${userPh})
       AND item_id IN (${itemPh})`,
    [...uniqueUsers, ...uniqueItems],
  );
  for (const r of rows) {
    const buyerId = Number(r.buyer_id);
    const itemId = Number(r.item_id);
    const set = out.get(buyerId) ?? new Set<number>();
    set.add(itemId);
    out.set(buyerId, set);
  }
  return out;
}

/**
 * List users entitled for this author: active CEP devices, author subscriptions,
 * or purchased packs. One entry per user; devices nested when a CEP client exists.
 */
export async function listExtensionUsersForAuthor(opts: {
  authorId: number;
  q?: string;
  page?: number;
}): Promise<ListExtensionUsersResult> {
  await ensurePackagesProjectsTable();

  const cfg = getCepClientByAuthorId(opts.authorId);
  const client = cfg?.client ?? null;
  const extensionName = cfg?.extensionName ?? null;

  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const offset = (page - 1) * PAGE_SIZE;
  const q = opts.q?.trim() ?? "";

  const pool = getPool();
  const unionParts: string[] = [
    `SELECT buyer_id AS user_id FROM \`${SUB_TABLE}\` WHERE author_id = ?`,
    `SELECT buyer_id AS user_id FROM \`${SOLD_TABLE}\` WHERE author_id = ? AND status = 1`,
  ];
  const unionParams: Array<string | number> = [opts.authorId, opts.authorId];
  if (client) {
    unionParts.unshift(
      `SELECT user_id FROM \`${DEVICES_TABLE}\` WHERE client = ? AND revoked_at IS NULL`,
    );
    unionParams.unshift(client);
  }

  const entitled = unionParts.join(" UNION ");
  const filterParams: Array<string | number> = [...unionParams];
  let userFilter = "";
  if (q) {
    userFilter = ` AND (u.email LIKE ? OR u.name LIKE ?)`;
    const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
    filterParams.push(like, like);
  }

  type CountRow = RowDataPacket & { cnt: number };
  const [countRows] = await pool.execute<CountRow[]>(
    `SELECT COUNT(*) AS cnt FROM (
       SELECT DISTINCT e.user_id
       FROM (${entitled}) e
       JOIN users u ON u.id = e.user_id
       WHERE 1=1${userFilter}
     ) t`,
    filterParams,
  );
  const total = Number(countRows[0]?.cnt ?? 0);

  type UserPageRow = RowDataPacket & {
    user_id: number;
    email: string;
    name: string;
    last_seen_at: string | Date | null;
  };

  const pageParams: Array<string | number> = [...filterParams];
  let lastSeenJoin = `LEFT JOIN (SELECT CAST(NULL AS UNSIGNED) AS user_id, CAST(NULL AS DATETIME) AS last_seen_at) ls ON 1=0`;
  if (client) {
    lastSeenJoin = `LEFT JOIN (
      SELECT user_id, MAX(COALESCE(last_seen_at, created_at)) AS last_seen_at
      FROM \`${DEVICES_TABLE}\`
      WHERE client = ? AND revoked_at IS NULL
      GROUP BY user_id
    ) ls ON ls.user_id = u.id`;
    pageParams.push(client);
  }

  const [userPage] = await pool.execute<UserPageRow[]>(
    `SELECT u.id AS user_id, u.email, u.name, ls.last_seen_at
     FROM (
       SELECT DISTINCT e.user_id
       FROM (${entitled}) e
       JOIN users u ON u.id = e.user_id
       WHERE 1=1${userFilter}
     ) ids
     JOIN users u ON u.id = ids.user_id
     ${lastSeenJoin}
     ORDER BY (ls.last_seen_at IS NULL) ASC, ls.last_seen_at DESC, u.id DESC
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    pageParams,
  );

  if (userPage.length === 0) {
    return {
      client,
      extension_name: extensionName,
      users: [],
      page,
      page_size: PAGE_SIZE,
      total,
      device_total: 0,
    };
  }

  const userIds = userPage.map((r) => Number(r.user_id));
  const userPlaceholders = userIds.map(() => "?").join(",");

  let deviceRows: DeviceListRow[] = [];
  if (client) {
    const [rows] = await pool.execute<DeviceListRow[]>(
      `SELECT d.id, d.user_id, u.email, u.name,
              d.name AS device_name, d.ip, d.user_fingerprint, d.client,
              d.created_at, d.last_seen_at
       FROM \`${DEVICES_TABLE}\` d
       JOIN users u ON u.id = d.user_id
       WHERE d.client = ?
         AND d.revoked_at IS NULL
         AND d.user_id IN (${userPlaceholders})
       ORDER BY COALESCE(d.last_seen_at, d.created_at) DESC, d.id DESC`,
      [client, ...userIds],
    );
    deviceRows = rows;
  }

  const deviceIds = deviceRows.map((r) => Number(r.id));
  const [
    packsMap,
    errorsMap,
    errorCounts,
    sessionsMap,
    onlineMap,
    subRows,
    projects,
  ] = await Promise.all([
    listInstallsForDevices(deviceIds, opts.authorId),
    listRecentErrorsForDevices(deviceIds, 5),
    countErrorsForDevices(deviceIds),
    listLatestSessionsForDevices(deviceIds),
    getCepDevicesOnlineMap(deviceIds),
    loadSubscriptionBadges(userIds, opts.authorId),
    listVisiblePackagesProjects(opts.authorId),
  ]);

  const ownedByUser = await loadOwnedItemIdsByUser(
    userIds,
    ownershipLookupIdsForProjects(projects),
  );

  const devicesByUser = new Map<number, ExtensionDeviceDto[]>();
  for (const r of deviceRows) {
    const id = Number(r.id);
    const userId = Number(r.user_id);
    const session = sessionsMap.get(id);
    const device: ExtensionDeviceDto = {
      device_id: `dev_${id}`,
      device_name: r.device_name,
      ip: r.ip,
      user_fingerprint: r.user_fingerprint,
      client: r.client,
      created_at: toIso(r.created_at) ?? "",
      last_seen_at: toIso(r.last_seen_at),
      online: onlineMap.get(id) === true,
      host_app_id: session?.host_app_id ?? null,
      host_app_name: session?.host_app_name ?? null,
      host_version: session?.host_version ?? null,
      os: session?.os ?? null,
      extension_version: session?.extension_version ?? null,
      packs: packsMap.get(id) ?? [],
      error_count: errorCounts.get(id) ?? 0,
      recent_errors: errorsMap.get(id) ?? [],
    };
    const list = devicesByUser.get(userId) ?? [];
    list.push(device);
    devicesByUser.set(userId, list);
  }

  const users: ExtensionUserGroupDto[] = userPage.map((u) => {
    const userId = Number(u.user_id);
    const devices = devicesByUser.get(userId) ?? [];
    const newest =
      devices.reduce<string | null>((best, d) => {
        if (!best) return d.last_seen_at;
        if (!d.last_seen_at) return best;
        return lastSeenMs(d.last_seen_at) > lastSeenMs(best)
          ? d.last_seen_at
          : best;
      }, toIso(u.last_seen_at));
    const badge = subRows.get(userId) ?? {
      subscription_active: false,
      subscription_label: null,
      subscription_source: "none" as const,
    };
    const acquired_count = buildEntitledPacks({
      projects,
      ownedIds: ownedByUser.get(userId) ?? new Set(),
      subscriptionActive: badge.subscription_active,
    }).length;
    return {
      user_id: userId,
      email: u.email,
      name: u.name ?? "",
      last_seen_at: newest,
      device_count: devices.length,
      online_count: devices.filter((d) => d.online).length,
      devices,
      acquired_count,
      ...badge,
    };
  });

  return {
    client,
    extension_name: extensionName,
    users,
    page,
    page_size: PAGE_SIZE,
    total,
    device_total: deviceRows.length,
  };
}

async function loadSubscriptionBadges(
  userIds: number[],
  authorId: number,
): Promise<
  Map<
    number,
    {
      subscription_active: boolean;
      subscription_label: string | null;
      subscription_source: "admin" | "paddle" | "none";
    }
  >
> {
  const out = new Map<
    number,
    {
      subscription_active: boolean;
      subscription_label: string | null;
      subscription_source: "admin" | "paddle" | "none";
    }
  >();
  if (userIds.length === 0) return out;

  const pool = getPool();
  type Row = RowDataPacket & {
    buyer_id: number;
    status: number;
    plan: string | null;
    ends_at: string | Date | null;
    paddle_billing_period_ends_at: string | Date | null;
    paddle_product_name: string | null;
    paddle_price_id: string | null;
    system: string | null;
  };
  const placeholders = userIds.map(() => "?").join(",");
  const [rows] = await pool.execute<Row[]>(
    `SELECT buyer_id, status, plan, ends_at, paddle_billing_period_ends_at,
            paddle_product_name, paddle_price_id, \`system\`
     FROM \`${SUB_TABLE}\`
     WHERE author_id = ? AND buyer_id IN (${placeholders})
     ORDER BY id DESC`,
    [authorId, ...userIds],
  );

  const seen = new Set<number>();
  for (const r of rows) {
    const buyerId = Number(r.buyer_id);
    if (seen.has(buyerId)) continue;
    seen.add(buyerId);

    const endsAt = r.ends_at ?? r.paddle_billing_period_ends_at;
    const endsOk =
      endsAt == null ||
      (Number.isFinite(Date.parse(String(endsAt))) &&
        new Date(String(endsAt)) > new Date());
    const status = Number(r.status);
    const active =
      (status === 1 && endsOk) ||
      (status === -1 &&
        endsAt != null &&
        Number.isFinite(Date.parse(String(endsAt))) &&
        new Date(String(endsAt)) > new Date());

    const system = String(r.system ?? "").toLowerCase();
    const source: "admin" | "paddle" | "none" = !active
      ? "none"
      : system === "admin"
        ? "admin"
        : "paddle";

    const tierId =
      authorId === SPUNKRAM_AUTHOR_ID
        ? resolveSpunkramSubscriptionTierId({
            priceId: r.paddle_price_id,
            plan: r.plan,
            productName: r.paddle_product_name,
          })
        : null;

    out.set(buyerId, {
      subscription_active: active,
      subscription_label: formatAuthorSubscriptionLabel({
        authorId,
        active,
        plan: r.plan,
        productName: r.paddle_product_name,
        priceId: r.paddle_price_id,
        tierId,
      }),
      subscription_source: source,
    });
  }

  for (const id of userIds) {
    if (!out.has(id)) {
      out.set(id, {
        subscription_active: false,
        subscription_label: null,
        subscription_source: "none",
      });
    }
  }
  return out;
}

type SessionInfo = {
  host_app_id: string | null;
  host_app_name: string | null;
  host_version: string | null;
  os: string | null;
  extension_version: string | null;
};

async function listLatestSessionsForDevices(
  deviceIds: number[],
): Promise<Map<number, SessionInfo>> {
  const out = new Map<number, SessionInfo>();
  if (deviceIds.length === 0) return out;
  try {
    const pool = getPool();
    const placeholders = deviceIds.map(() => "?").join(",");
    type Row = RowDataPacket & {
      device_id: number;
      host_app_id: string | null;
      host_app_name: string | null;
      host_version: string | null;
      os: string | null;
      extension_version: string | null;
    };
    const [rows] = await pool.execute<Row[]>(
      `SELECT device_id, host_app_id, host_app_name, host_version, os, extension_version
       FROM (
         SELECT device_id, host_app_id, host_app_name, host_version, os, extension_version,
                ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY reported_at DESC, id DESC) AS rn
         FROM \`${CEP_CLIENT_SESSIONS_TABLE}\`
         WHERE device_id IN (${placeholders})
       ) t
       WHERE rn = 1`,
      deviceIds,
    );
    for (const r of rows) {
      out.set(Number(r.device_id), {
        host_app_id: r.host_app_id,
        host_app_name: r.host_app_name,
        host_version: r.host_version,
        os: r.os,
        extension_version: r.extension_version,
      });
    }
  } catch {
    /* table may not exist yet on fresh installs */
  }
  return out;
}

/**
 * Admin revoke: device must belong to the author's CEP client and be active.
 */
export async function adminRevokeExtensionDevice(opts: {
  authorId: number;
  deviceIdRaw: unknown;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const cfg = getCepClientByAuthorId(opts.authorId);
  if (!cfg) {
    return { ok: false, error: "NO_CEP_CLIENT", status: 404 };
  }

  const deviceId = parseDeviceId(opts.deviceIdRaw);
  if (!deviceId) {
    return { ok: false, error: "INVALID_DEVICE", status: 400 };
  }

  const pool = getPool();
  type Row = RowDataPacket & {
    id: number;
    user_id: number;
    client: string;
  };
  const [rows] = await pool.execute<Row[]>(
    `SELECT id, user_id, client FROM \`${DEVICES_TABLE}\`
     WHERE id = ? AND revoked_at IS NULL LIMIT 1`,
    [deviceId],
  );
  const row = rows[0];
  if (!row) {
    return { ok: false, error: "NOT_FOUND", status: 404 };
  }
  if (row.client !== cfg.client) {
    return { ok: false, error: "WRONG_CLIENT", status: 403 };
  }

  const revoked = await revokeDevice(Number(row.user_id), deviceId);
  if (!revoked) {
    return { ok: false, error: "NOT_FOUND", status: 404 };
  }
  return { ok: true };
}

export type ExtensionInstalledPackDto = {
  pack_id: number;
  name: string;
  host: string | null;
  catalog_version: string | null;
  /** Best-effort: first non-null installed version across devices. */
  installed_version: string | null;
  devices: Array<{
    device_id: string;
    device_name: string | null;
    installed_version: string | null;
  }>;
};

export type ExtensionActivePackDto = {
  pack_id: number;
  name: string;
  host: string | null;
  catalog_version: string | null;
  devices: Array<{
    device_id: string;
    device_name: string | null;
  }>;
};

export type ExtensionUserPacksDto = {
  user_id: number;
  email: string;
  name: string;
  subscription_active: boolean;
  purchased: ExtensionOwnedPackDto[];
  installed: ExtensionInstalledPackDto[];
  active: ExtensionActivePackDto[];
};

/**
 * Pack breakdown for one user under an author (admin packs modal).
 * Works without a CEP client (purchases + subscription only).
 */
export async function getExtensionUserPacks(opts: {
  authorId: number;
  userId: number;
}): Promise<ExtensionUserPacksDto | null> {
  const cfg = getCepClientByAuthorId(opts.authorId);

  await ensurePackagesProjectsTable();
  const pool = getPool();

  type UserRow = RowDataPacket & {
    id: number;
    email: string;
    name: string;
  };
  const [userRows] = await pool.execute<UserRow[]>(
    `SELECT id, email, name FROM users WHERE id = ? LIMIT 1`,
    [opts.userId],
  );
  const user = userRows[0];
  if (!user) return null;

  type DevRow = RowDataPacket & {
    id: number;
    name: string | null;
  };
  let devRows: DevRow[] = [];
  if (cfg) {
    const [rows] = await pool.execute<DevRow[]>(
      `SELECT id, name FROM \`${DEVICES_TABLE}\`
       WHERE user_id = ? AND client = ? AND revoked_at IS NULL
       ORDER BY COALESCE(last_seen_at, created_at) DESC, id DESC`,
      [opts.userId, cfg.client],
    );
    devRows = rows;
  }

  const deviceIds = devRows.map((d) => Number(d.id));
  const deviceMeta = new Map(
    devRows.map((d) => [
      Number(d.id),
      { device_id: `dev_${d.id}`, device_name: d.name },
    ]),
  );

  const [subscription, projects, installsMap, activeMap] = await Promise.all([
    getActiveAuthorSubscription(opts.userId, opts.authorId),
    listVisiblePackagesProjects(opts.authorId),
    listInstallsForDevices(deviceIds, opts.authorId),
    listActivePacksForDevices(deviceIds, opts.authorId),
  ]);

  const ownershipLookupIds = ownershipLookupIdsForProjects(projects);
  const ownedIds = await getOwnedItemIdSet(opts.userId, ownershipLookupIds);
  const subscriptionActive = subscription.active;

  const purchased = buildEntitledPacks({
    projects,
    ownedIds,
    subscriptionActive,
  });

  const installedByPack = new Map<number, ExtensionInstalledPackDto>();
  for (const [deviceId, packs] of installsMap) {
    const meta = deviceMeta.get(deviceId);
    if (!meta) continue;
    for (const p of packs) {
      const existing = installedByPack.get(p.pack_id);
      if (!existing) {
        installedByPack.set(p.pack_id, {
          pack_id: p.pack_id,
          name: p.name,
          host: p.host,
          catalog_version: p.catalog_version,
          installed_version: p.installed_version,
          devices: [
            {
              device_id: meta.device_id,
              device_name: meta.device_name,
              installed_version: p.installed_version,
            },
          ],
        });
      } else {
        existing.devices.push({
          device_id: meta.device_id,
          device_name: meta.device_name,
          installed_version: p.installed_version,
        });
        if (!existing.installed_version && p.installed_version) {
          existing.installed_version = p.installed_version;
        }
      }
    }
  }
  const installed = [...installedByPack.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const activeByPack = new Map<number, ExtensionActivePackDto>();
  for (const [deviceId, packs] of activeMap) {
    const meta = deviceMeta.get(deviceId);
    if (!meta) continue;
    for (const p of packs) {
      const existing = activeByPack.get(p.pack_id);
      if (!existing) {
        activeByPack.set(p.pack_id, {
          pack_id: p.pack_id,
          name: p.name,
          host: p.host,
          catalog_version: p.catalog_version,
          devices: [
            {
              device_id: meta.device_id,
              device_name: meta.device_name,
            },
          ],
        });
      } else {
        existing.devices.push({
          device_id: meta.device_id,
          device_name: meta.device_name,
        });
      }
    }
  }
  const active = [...activeByPack.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return {
    user_id: Number(user.id),
    email: user.email,
    name: user.name ?? "",
    subscription_active: subscriptionActive,
    purchased,
    installed,
    active,
  };
}
