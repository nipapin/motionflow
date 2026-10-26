import "server-only";

import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { packagesProjectsTableName } from "@/lib/packages-authors-db";
import { ensureUserActivitySchema } from "@/lib/user-activity";
import { recordPackActivity, type ActivityPack } from "@/lib/pack-activity";

export const CEP_DEVICE_ACTIVE_PACKS_TABLE = "cep_device_active_packs";

/** Max pack ids accepted in one active snapshot. */
export const CEP_ACTIVE_MAX_PACKS = 50;

let schemaEnsured = false;

async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  const pool = getPool();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${CEP_DEVICE_ACTIVE_PACKS_TABLE}\` (
       \`device_id\` BIGINT UNSIGNED NOT NULL,
       \`pack_id\` BIGINT UNSIGNED NOT NULL,
       \`reported_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (\`device_id\`, \`pack_id\`),
       KEY \`idx_cep_device_active_packs_pack\` (\`pack_id\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  schemaEnsured = true;
}

export async function ensureCepDeviceActivePacksSchema(): Promise<void> {
  await ensureSchema();
}

/**
 * Replace packs currently in use on this device (panel heartbeat / focus).
 */
export async function replaceCepDeviceActivePacks(opts: {
  userId: number;
  deviceId: number;
  authorId: number;
  packIds: number[];
}): Promise<{ stored: number; rejected: number }> {
  await ensureSchema();
  const pool = getPool();
  const projectsTable = packagesProjectsTableName();

  const unique = [
    ...new Set(
      opts.packIds
        .filter((n) => Number.isInteger(n) && n > 0)
        .slice(0, CEP_ACTIVE_MAX_PACKS),
    ),
  ];

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
    const [devices] = await conn.execute<RowDataPacket[]>("SELECT id FROM cep_devices WHERE id = ? AND user_id = ? FOR UPDATE", [opts.deviceId, opts.userId]);
    if (devices.length !== 1) throw new Error("Device does not belong to user");
    const [previousRows] = await conn.execute<(RowDataPacket & { pack_id: number; name: string | null })[]>(
      `SELECT a.pack_id, p.name FROM \`${CEP_DEVICE_ACTIVE_PACKS_TABLE}\` a
       LEFT JOIN \`${projectsTable}\` p ON p.id = a.pack_id WHERE a.device_id = ?`, [opts.deviceId],
    );
    const previous: ActivityPack[] = previousRows.map((row) => ({ id: Number(row.pack_id), name: row.name, version: null }));
    await conn.execute(
      `DELETE FROM \`${CEP_DEVICE_ACTIVE_PACKS_TABLE}\` WHERE device_id = ?`,
      [opts.deviceId],
    );
    if (allowed.length > 0) {
      const values = allowed.map(() => "(?, ?, NOW())").join(", ");
      const params: number[] = [];
      for (const packId of allowed) {
        params.push(opts.deviceId, packId);
      }
      await conn.execute(
        `INSERT INTO \`${CEP_DEVICE_ACTIVE_PACKS_TABLE}\`
           (device_id, pack_id, reported_at)
         VALUES ${values}`,
        params,
      );
    }
    if (activityReady) await recordPackActivity(conn, {
      userId: opts.userId, deviceId: opts.deviceId, mode: "active", previous,
      next: allowed.map((id) => ({ id, name: names.get(id) ?? null, version: null })),
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

export type CepDeviceActivePack = {
  pack_id: number;
  name: string;
  host: string | null;
  catalog_version: string | null;
};

export async function listActivePacksForDevices(
  deviceIds: number[],
  authorId: number,
): Promise<Map<number, CepDeviceActivePack[]>> {
  const out = new Map<number, CepDeviceActivePack[]>();
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
  };
  const [rows] = await pool.execute<Row[]>(
    `SELECT a.device_id, a.pack_id, p.name, p.host, p.version AS catalog_version
     FROM \`${CEP_DEVICE_ACTIVE_PACKS_TABLE}\` a
     JOIN \`${projectsTable}\` p ON p.id = a.pack_id
     WHERE a.device_id IN (${placeholders})
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
    });
    out.set(deviceId, list);
  }
  return out;
}
