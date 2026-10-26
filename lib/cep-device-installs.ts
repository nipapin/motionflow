import "server-only";

import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { packagesProjectsTableName } from "@/lib/packages-authors-db";
import { ensureUserActivitySchema } from "@/lib/user-activity";
import { recordPackActivity, type ActivityPack } from "@/lib/pack-activity";

export const CEP_DEVICE_INSTALLS_TABLE = "cep_device_installs";

/** Max pack entries accepted in one snapshot. */
export const CEP_INSTALLS_MAX_PACKS = 200;

let schemaEnsured = false;

export type CepInstallPackInput = {
  pack_id: number;
  version?: string | null;
};

async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  const pool = getPool();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${CEP_DEVICE_INSTALLS_TABLE}\` (
       \`device_id\` BIGINT UNSIGNED NOT NULL,
       \`pack_id\` BIGINT UNSIGNED NOT NULL,
       \`version\` VARCHAR(64) NULL,
       \`reported_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (\`device_id\`, \`pack_id\`),
       KEY \`idx_cep_device_installs_pack\` (\`pack_id\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  try {
    await pool.query(
      `ALTER TABLE \`${CEP_DEVICE_INSTALLS_TABLE}\`
       ADD COLUMN \`version\` VARCHAR(64) NULL AFTER \`pack_id\``,
    );
  } catch {
    /* column already exists */
  }
  schemaEnsured = true;
}

/**
 * Replace the device's installed-pack snapshot.
 * Only ids belonging to `authorId` in packages_projects (not soft-deleted) are kept.
 */
export async function replaceCepDeviceInstalls(opts: {
  userId: number;
  deviceId: number;
  authorId: number;
  packs: CepInstallPackInput[];
}): Promise<{ stored: number; rejected: number }> {
  await ensureSchema();
  const pool = getPool();
  const projectsTable = packagesProjectsTableName();

  const byId = new Map<number, string | null>();
  for (const p of opts.packs.slice(0, CEP_INSTALLS_MAX_PACKS)) {
    if (!Number.isInteger(p.pack_id) || p.pack_id <= 0) continue;
    const ver =
      typeof p.version === "string" && p.version.trim()
        ? p.version.trim().slice(0, 64)
        : null;
    byId.set(p.pack_id, ver);
  }
  const unique = [...byId.keys()];

  let activityReady = true;
  try { await ensureUserActivitySchema(); } catch { activityReady = false; console.error("[user-activity] schema unavailable"); }
  let allowed: number[] = [];
  const names = new Map<number, string>();
  if (unique.length > 0) {
    const placeholders = unique.map(() => "?").join(",");
    type IdRow = RowDataPacket & { id: number; name: string };
    const [rows] = await pool.execute<IdRow[]>(
      `SELECT id, name FROM \`${projectsTable}\`
       WHERE author_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
      [opts.authorId, ...unique],
    );
    allowed = rows.map((r) => Number(r.id));
    for (const row of rows) names.set(Number(row.id), row.name);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Serialize full snapshots for one device so concurrent heartbeats cannot create false changes.
    const [devices] = await conn.execute<RowDataPacket[]>("SELECT id FROM cep_devices WHERE id = ? AND user_id = ? FOR UPDATE", [opts.deviceId, opts.userId]);
    if (devices.length !== 1) throw new Error("Device does not belong to user");
    const [previousRows] = await conn.execute<(RowDataPacket & { pack_id: number; version: string | null; name: string | null })[]>(
      `SELECT i.pack_id, i.version, p.name FROM \`${CEP_DEVICE_INSTALLS_TABLE}\` i
       LEFT JOIN \`${projectsTable}\` p ON p.id = i.pack_id WHERE i.device_id = ?`, [opts.deviceId],
    );
    const previous: ActivityPack[] = previousRows.map((row) => ({ id: Number(row.pack_id), name: row.name, version: row.version }));
    await conn.execute(
      `DELETE FROM \`${CEP_DEVICE_INSTALLS_TABLE}\` WHERE device_id = ?`,
      [opts.deviceId],
    );
    if (allowed.length > 0) {
      const values = allowed.map(() => "(?, ?, ?, NOW())").join(", ");
      const params: Array<number | string | null> = [];
      for (const packId of allowed) {
        params.push(opts.deviceId, packId, byId.get(packId) ?? null);
      }
      await conn.execute(
        `INSERT INTO \`${CEP_DEVICE_INSTALLS_TABLE}\`
           (device_id, pack_id, version, reported_at)
         VALUES ${values}`,
        params,
      );
    }
    if (activityReady) await recordPackActivity(conn, {
      userId: opts.userId, deviceId: opts.deviceId, mode: "installs", previous,
      next: allowed.map((id) => ({ id, name: names.get(id) ?? null, version: byId.get(id) ?? null })),
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return {
    stored: allowed.length,
    rejected: unique.length - allowed.length,
  };
}

export type CepDeviceInstallPack = {
  pack_id: number;
  name: string;
  host: string | null;
  catalog_version: string | null;
  installed_version: string | null;
};

export async function listInstallsForDevices(
  deviceIds: number[],
  authorId: number,
): Promise<Map<number, CepDeviceInstallPack[]>> {
  const out = new Map<number, CepDeviceInstallPack[]>();
  if (deviceIds.length === 0) return out;
  await ensureSchema();
  const pool = getPool();
  const projectsTable = packagesProjectsTableName();
  const placeholders = deviceIds.map(() => "?").join(",");
  type Row = RowDataPacket & {
    device_id: number;
    pack_id: number;
    name: string;
    host: string | null;
    catalog_version: string | null;
    installed_version: string | null;
  };
  const [rows] = await pool.execute<Row[]>(
    `SELECT i.device_id, i.pack_id, p.name, p.host,
            p.version AS catalog_version, i.version AS installed_version
     FROM \`${CEP_DEVICE_INSTALLS_TABLE}\` i
     JOIN \`${projectsTable}\` p ON p.id = i.pack_id
     WHERE i.device_id IN (${placeholders})
       AND p.author_id = ?
       AND p.deleted_at IS NULL
     ORDER BY p.name ASC`,
    [...deviceIds, authorId],
  );
  for (const r of rows) {
    const deviceId = Number(r.device_id);
    const list = out.get(deviceId) ?? [];
    list.push({
      pack_id: Number(r.pack_id),
      name: r.name,
      host: r.host,
      catalog_version: r.catalog_version,
      installed_version: r.installed_version,
    });
    out.set(deviceId, list);
  }
  return out;
}

/** Ensure schema exists (for admin list paths that only read). */
export async function ensureCepDeviceInstallsSchema(): Promise<void> {
  await ensureSchema();
}
