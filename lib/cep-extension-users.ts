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
import { getOwnedItemIdSet } from "@/lib/purchases";
import { listVisiblePackagesProjects } from "@/lib/packages-projects";
import { ensurePackagesProjectsTable } from "@/lib/packages-authors-db";
import { getCepDevicesOnlineMap } from "@/lib/cep-presence";

const DEVICES_TABLE = "cep_devices";
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
};

export type ListExtensionUsersResult = {
  client: string;
  extension_name: string;
  users: ExtensionUserGroupDto[];
  page: number;
  page_size: number;
  /** Distinct users with at least one active device. */
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

/**
 * List users with active CEP devices for the author's registered client.
 * One entry per user; devices nested. Paginated by user.
 * Returns null when the author has no CEP client in the registry.
 */
export async function listExtensionUsersForAuthor(opts: {
  authorId: number;
  q?: string;
  page?: number;
}): Promise<ListExtensionUsersResult | null> {
  const cfg = getCepClientByAuthorId(opts.authorId);
  if (!cfg) return null;

  await ensurePackagesProjectsTable();

  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const offset = (page - 1) * PAGE_SIZE;
  const q = opts.q?.trim() ?? "";

  const pool = getPool();
  const params: Array<string | number> = [cfg.client];
  let where = `d.client = ? AND d.revoked_at IS NULL`;

  if (q) {
    where += ` AND (u.email LIKE ? OR u.name LIKE ?)`;
    const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
    params.push(like, like);
  }

  type CountRow = RowDataPacket & { cnt: number };
  const [countRows] = await pool.execute<CountRow[]>(
    `SELECT COUNT(DISTINCT d.user_id) AS cnt
     FROM \`${DEVICES_TABLE}\` d
     JOIN users u ON u.id = d.user_id
     WHERE ${where}`,
    params,
  );
  const total = Number(countRows[0]?.cnt ?? 0);

  type UserPageRow = RowDataPacket & {
    user_id: number;
    email: string;
    name: string;
    last_seen_at: string | Date | null;
  };
  const [userPage] = await pool.execute<UserPageRow[]>(
    `SELECT d.user_id, u.email, u.name,
            MAX(COALESCE(d.last_seen_at, d.created_at)) AS last_seen_at
     FROM \`${DEVICES_TABLE}\` d
     JOIN users u ON u.id = d.user_id
     WHERE ${where}
     GROUP BY d.user_id, u.email, u.name
     ORDER BY last_seen_at DESC, d.user_id DESC
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    params,
  );

  if (userPage.length === 0) {
    return {
      client: cfg.client,
      extension_name: cfg.extensionName,
      users: [],
      page,
      page_size: PAGE_SIZE,
      total,
      device_total: 0,
    };
  }

  const userIds = userPage.map((r) => Number(r.user_id));
  const userPlaceholders = userIds.map(() => "?").join(",");

  const [deviceRows] = await pool.execute<DeviceListRow[]>(
    `SELECT d.id, d.user_id, u.email, u.name,
            d.name AS device_name, d.ip, d.user_fingerprint, d.client,
            d.created_at, d.last_seen_at
     FROM \`${DEVICES_TABLE}\` d
     JOIN users u ON u.id = d.user_id
     WHERE d.client = ?
       AND d.revoked_at IS NULL
       AND d.user_id IN (${userPlaceholders})
     ORDER BY COALESCE(d.last_seen_at, d.created_at) DESC, d.id DESC`,
    [cfg.client, ...userIds],
  );

  const deviceIds = deviceRows.map((r) => Number(r.id));
  const [packsMap, errorsMap, errorCounts, sessionsMap, onlineMap] =
    await Promise.all([
      listInstallsForDevices(deviceIds, opts.authorId),
      listRecentErrorsForDevices(deviceIds, 5),
      countErrorsForDevices(deviceIds),
      listLatestSessionsForDevices(deviceIds),
      getCepDevicesOnlineMap(deviceIds),
    ]);

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
    const newest = devices.reduce<string | null>((best, d) => {
      if (!best) return d.last_seen_at;
      if (!d.last_seen_at) return best;
      return lastSeenMs(d.last_seen_at) > lastSeenMs(best)
        ? d.last_seen_at
        : best;
    }, toIso(u.last_seen_at));
    return {
      user_id: userId,
      email: u.email,
      name: u.name ?? "",
      last_seen_at: newest,
      device_count: devices.length,
      online_count: devices.filter((d) => d.online).length,
      devices,
    };
  });

  return {
    client: cfg.client,
    extension_name: cfg.extensionName,
    users,
    page,
    page_size: PAGE_SIZE,
    total,
    device_total: deviceRows.length,
  };
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
 * Pack breakdown for one user under an author's CEP client (admin packs modal).
 */
export async function getExtensionUserPacks(opts: {
  authorId: number;
  userId: number;
}): Promise<ExtensionUserPacksDto | null> {
  const cfg = getCepClientByAuthorId(opts.authorId);
  if (!cfg) return null;

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
  const [devRows] = await pool.execute<DevRow[]>(
    `SELECT id, name FROM \`${DEVICES_TABLE}\`
     WHERE user_id = ? AND client = ? AND revoked_at IS NULL
     ORDER BY COALESCE(last_seen_at, created_at) DESC, id DESC`,
    [opts.userId, cfg.client],
  );

  const deviceIds = devRows.map((d) => Number(d.id));
  const deviceMeta = new Map(
    devRows.map((d) => [
      Number(d.id),
      { device_id: `dev_${d.id}`, device_name: d.name },
    ]),
  );

  const [subscription, projects, installsMap, activeMap] = await Promise.all([
    getActiveAuthorSubscription(opts.userId, cfg.authorId),
    listVisiblePackagesProjects(cfg.authorId),
    listInstallsForDevices(deviceIds, opts.authorId),
    listActivePacksForDevices(deviceIds, opts.authorId),
  ]);

  const ownershipLookupIds = projects.flatMap((p) => {
    const ids: number[] = [p.id];
    if (p.marketplace_item_id != null) ids.push(p.marketplace_item_id);
    return ids;
  });
  const ownedIds = await getOwnedItemIdSet(opts.userId, ownershipLookupIds);
  const subscriptionActive = subscription.active;

  const purchased: ExtensionOwnedPackDto[] = [];
  for (const project of projects) {
    if (project.admin_only) continue;
    const owned =
      (project.marketplace_item_id != null &&
        ownedIds.has(project.marketplace_item_id)) ||
      ownedIds.has(project.id);
    const price = Number(project.price) || 0;
    const isFree = price <= 0;

    let access: ExtensionPackAccessSource | null = null;
    if (owned) access = "purchase";
    else if (subscriptionActive) access = "subscription";
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
