import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

/**
 * CEP (Adobe extension) device-code auth.
 *
 * Flow (see CEP/spunkram-library/docs/BACKEND_CEP_API.md):
 *   1. Panel: POST /api/cep/auth/device        → cep_auth_sessions row + short code
 *   2. Browser: /cep/login?code=… (session)    → approve/deny (approveAuthSession)
 *   3. Panel:  POST /api/cep/auth/token (poll) → one-time token claim (claimAuthToken)
 *   4. Panel:  Authorization: Bearer <token>   → resolveCepBearerUser on every CEP route
 *
 * Tokens are opaque (`mfcep_…`), stored only as SHA-256 hashes in cep_devices.
 * Revoking a device invalidates its token; the next /me returns 401.
 */

const DEVICES_TABLE = "cep_devices";
const SESSIONS_TABLE = "cep_auth_sessions";

export const DEVICE_CODE_TTL_SECONDS = 300;
export const DEVICE_CODE_POLL_INTERVAL_SECONDS = 3;

/** Max simultaneously signed-in CEP devices per user. */
export function cepDeviceLimit(): number {
  const n = Number(process.env.CEP_DEVICE_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}

let schemaEnsured = false;

/** Lazily create the tables on first use (same DDL as db/migrations/2026_08_01_cep_auth_devices.sql). */
async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  const pool = getPool();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${DEVICES_TABLE}\` (
       id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       user_id BIGINT UNSIGNED NOT NULL,
       token_hash CHAR(64) NOT NULL,
       user_fingerprint TEXT NULL,
       name VARCHAR(191) NULL,
       ip VARCHAR(45) NULL,
       client VARCHAR(64) NOT NULL DEFAULT 'spunkram-cep',
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       last_seen_at DATETIME NULL,
       revoked_at DATETIME NULL,
       PRIMARY KEY (id),
       UNIQUE KEY uq_cep_devices_token_hash (token_hash),
       KEY idx_cep_devices_user (user_id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${SESSIONS_TABLE}\` (
       id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       code VARCHAR(16) NOT NULL,
       status VARCHAR(16) NOT NULL DEFAULT 'pending',
       usp TEXT NULL,
       device_json TEXT NULL,
       client VARCHAR(64) NOT NULL DEFAULT 'spunkram-cep',
       ip VARCHAR(45) NULL,
       user_id BIGINT UNSIGNED NULL,
       device_id BIGINT UNSIGNED NULL,
       -- SHA-256 of the panel-only device_code (never leave the panel / start response)
       device_code_hash CHAR(64) NULL,
       token_plain VARCHAR(128) NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       expires_at DATETIME NOT NULL,
       claimed_at DATETIME NULL,
       PRIMARY KEY (id),
       UNIQUE KEY uq_cep_auth_sessions_code (code),
       KEY idx_cep_auth_sessions_created (created_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  // Older installs created the table without device_code_hash — add if missing.
  try {
    await pool.query(
      `ALTER TABLE \`${SESSIONS_TABLE}\` ADD COLUMN device_code_hash CHAR(64) NULL AFTER device_id`,
    );
  } catch {
    /* column already exists */
  }
  schemaEnsured = true;
}

/** Client IP behind Cloudflare / reverse proxies (mirrors lib/contact-requests.ts). */
export function cepClientIp(headers: Headers): string | null {
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("true-client-ip"),
    headers.get("x-real-ip"),
    headers.get("x-client-ip"),
  ];
  for (const v of candidates) {
    if (v && v.trim()) return v.trim().slice(0, 45);
  }
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first ? first.slice(0, 45) : null;
}

/** No 0/O/1/I to keep the code easy to retype from the panel. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 3) out += "-";
  }
  return out;
}

function generateToken(): { token: string; hash: string } {
  const token = `mfcep_${randomBytes(32).toString("hex")}`;
  return { token, hash: hashToken(token) };
}

/** Panel-only secret returned once from POST /auth/device; required to claim the token. */
function generateDeviceCode(): { deviceCode: string; hash: string } {
  const deviceCode = `mfdev_${randomBytes(32).toString("hex")}`;
  return { deviceCode, hash: hashToken(deviceCode) };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashesEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(t)) return null;
  return t;
}

export function normalizeDeviceCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!/^mfdev_[a-f0-9]{64}$/i.test(t)) return null;
  return t;
}

export type CepDeviceFingerprint = {
  mac?: string;
  user?: string;
  os?: string;
};

type SessionRow = RowDataPacket & {
  id: number;
  code: string;
  status: string;
  usp: string | null;
  device_json: string | null;
  client: string;
  ip: string | null;
  user_id: number | null;
  device_id: number | null;
  device_code_hash: string | null;
  token_plain: string | null;
  created_at: string;
  expires_at: string;
  claimed_at: string | null;
  /** Computed in SELECT: 1 when expires_at < NOW(). */
  is_expired?: number;
};

type DeviceRow = RowDataPacket & {
  id: number;
  user_id: number;
  user_fingerprint: string | null;
  name: string | null;
  ip: string | null;
  client: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
};

// ---------------------------------------------------------------------------
// Auth sessions (device-code flow)
// ---------------------------------------------------------------------------

export async function createAuthSession(input: {
  usp?: string | null;
  device?: CepDeviceFingerprint | null;
  client?: string | null;
  ip?: string | null;
}): Promise<{
  code: string;
  deviceCode: string;
  expiresIn: number;
  interval: number;
}> {
  await ensureSchema();
  const pool = getPool();
  const client = (input.client ?? "spunkram-cep").slice(0, 64);
  const deviceJson = input.device ? JSON.stringify(input.device) : null;
  const { deviceCode, hash: deviceCodeHash } = generateDeviceCode();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    try {
      await pool.execute<ResultSetHeader>(
        `INSERT INTO \`${SESSIONS_TABLE}\`
           (code, status, usp, device_json, client, ip, device_code_hash, expires_at)
         VALUES (?, 'pending', ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
        [
          code,
          input.usp ?? null,
          deviceJson,
          client,
          input.ip ?? null,
          deviceCodeHash,
          DEVICE_CODE_TTL_SECONDS,
        ],
      );
      return {
        code,
        deviceCode,
        expiresIn: DEVICE_CODE_TTL_SECONDS,
        interval: DEVICE_CODE_POLL_INTERVAL_SECONDS,
      };
    } catch (err) {
      const dup =
        err instanceof Error && "code" in err && err.code === "ER_DUP_ENTRY";
      if (!dup) throw err;
    }
  }
  throw new Error("Could not allocate a unique device code");
}

export type AuthSessionInfo = {
  id: number;
  code: string;
  status: "pending" | "complete" | "denied" | "expired";
  device: CepDeviceFingerprint | null;
  client: string;
  userId: number | null;
};

async function fetchSessionByCode(code: string): Promise<SessionRow | null> {
  await ensureSchema();
  const pool = getPool();
  const [rows] = await pool.execute<SessionRow[]>(
    `SELECT *, (expires_at < NOW()) AS is_expired
     FROM \`${SESSIONS_TABLE}\` WHERE code = ? LIMIT 1`,
    [code],
  );
  return rows[0] ?? null;
}

function effectiveStatus(row: SessionRow): AuthSessionInfo["status"] {
  if (row.status === "pending" && Number(row.is_expired) === 1) {
    return "expired";
  }
  if (
    row.status === "complete" ||
    row.status === "denied" ||
    row.status === "expired"
  ) {
    return row.status;
  }
  return "pending";
}

function parseFingerprint(json: string | null): CepDeviceFingerprint | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as unknown;
    if (v && typeof v === "object") return v as CepDeviceFingerprint;
  } catch {
    /* ignore */
  }
  return null;
}

/** Session info for the /cep/login confirmation page. */
export async function getAuthSessionInfo(
  code: string,
): Promise<AuthSessionInfo | null> {
  const row = await fetchSessionByCode(code);
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    status: effectiveStatus(row),
    device: parseFingerprint(row.device_json),
    client: row.client,
    userId: row.user_id,
  };
}

export type ApproveResult =
  | { ok: true }
  | { ok: false; error: "INVALID_CODE" | "CODE_EXPIRED" | "DEVICE_LIMIT" };

/**
 * Approve a pending login session as the signed-in web user: create (or
 * refresh) the CEP device, generate its Bearer token and stash it on the
 * session row for the panel's next poll.
 */
export async function approveAuthSession(
  code: string,
  userId: number,
  approverIp?: string | null,
): Promise<ApproveResult> {
  const row = await fetchSessionByCode(code);
  if (!row) return { ok: false, error: "INVALID_CODE" };
  const status = effectiveStatus(row);
  if (status === "expired") return { ok: false, error: "CODE_EXPIRED" };
  if (status !== "pending") return { ok: false, error: "INVALID_CODE" };

  const fingerprint = parseFingerprint(row.device_json);
  const pool = getPool();

  // Same physical machine (matched by MAC) re-logging in: rotate the token on
  // the existing device row instead of burning a device slot.
  const existing = await findActiveDeviceByMac(userId, fingerprint?.mac);

  const { token, hash } = generateToken();
  let deviceId: number;

  if (existing) {
    await pool.execute<ResultSetHeader>(
      `UPDATE \`${DEVICES_TABLE}\`
       SET token_hash = ?, user_fingerprint = ?, ip = ?, client = ?, last_seen_at = NOW()
       WHERE id = ?`,
      [
        hash,
        row.device_json,
        approverIp ?? row.ip,
        row.client,
        existing.id,
      ],
    );
    deviceId = existing.id;
  } else {
    const activeCount = await countActiveDevices(userId);
    if (activeCount >= cepDeviceLimit()) {
      return { ok: false, error: "DEVICE_LIMIT" };
    }
    const [res] = await pool.execute<ResultSetHeader>(
      `INSERT INTO \`${DEVICES_TABLE}\`
         (user_id, token_hash, user_fingerprint, name, ip, client, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        userId,
        hash,
        row.device_json,
        fingerprint?.user?.slice(0, 191) ?? null,
        row.ip,
        row.client,
      ],
    );
    deviceId = res.insertId;
  }

  const [upd] = await pool.execute<ResultSetHeader>(
    `UPDATE \`${SESSIONS_TABLE}\`
     SET status = 'complete', user_id = ?, device_id = ?, token_plain = ?
     WHERE id = ? AND status = 'pending' AND expires_at >= NOW()`,
    [userId, deviceId, token, row.id],
  );
  if (upd.affectedRows === 0) {
    // Lost a race (expired or double-submit) — do not leave a live orphan token.
    await pool.execute(
      `UPDATE \`${DEVICES_TABLE}\` SET revoked_at = NOW() WHERE id = ? AND token_hash = ?`,
      [deviceId, hash],
    );
    return { ok: false, error: "CODE_EXPIRED" };
  }
  return { ok: true };
}

export async function denyAuthSession(code: string): Promise<boolean> {
  const pool = getPool();
  await ensureSchema();
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE \`${SESSIONS_TABLE}\` SET status = 'denied' WHERE code = ? AND status = 'pending'`,
    [code],
  );
  return res.affectedRows > 0;
}

export type ClaimResult =
  | { status: "pending" }
  | { status: "expired" | "denied"; message: string }
  | {
      status: "complete";
      token: string;
      user: { id: number; email: string; name: string };
    };

/** Poll handler for POST /api/cep/auth/token. Requires the panel-only device_code. */
export async function claimAuthToken(
  code: string,
  deviceCode: string,
): Promise<ClaimResult> {
  const row = await fetchSessionByCode(code);
  if (!row) return { status: "expired", message: "Code expired" };

  if (!row.device_code_hash || !hashesEqual(row.device_code_hash, hashToken(deviceCode))) {
    return { status: "expired", message: "Invalid device code" };
  }

  const status = effectiveStatus(row);
  if (status === "pending") return { status: "pending" };
  if (status === "denied") return { status: "denied", message: "User denied" };
  if (status === "expired") return { status: "expired", message: "Code expired" };

  // complete
  if (!row.token_plain || !row.user_id) {
    return { status: "expired", message: "Code already used" };
  }

  const pool = getPool();
  const [upd] = await pool.execute<ResultSetHeader>(
    `UPDATE \`${SESSIONS_TABLE}\`
     SET token_plain = NULL, claimed_at = NOW()
     WHERE id = ? AND token_plain IS NOT NULL`,
    [row.id],
  );
  if (upd.affectedRows === 0) {
    return { status: "expired", message: "Code already used" };
  }

  const user = await loadUserBasic(row.user_id);
  if (!user) return { status: "expired", message: "User not found" };
  return { status: "complete", token: row.token_plain, user };
}

// ---------------------------------------------------------------------------
// Devices / Bearer tokens
// ---------------------------------------------------------------------------

type UserBasicRow = RowDataPacket & { id: number; email: string; name: string };

async function loadUserBasic(
  userId: number,
): Promise<{ id: number; email: string; name: string } | null> {
  const pool = getPool();
  const [rows] = await pool.execute<UserBasicRow[]>(
    "SELECT id, email, name FROM users WHERE id = ? LIMIT 1",
    [userId],
  );
  const u = rows[0];
  if (!u) return null;
  return { id: Number(u.id), email: u.email, name: u.name ?? "" };
}

async function countActiveDevices(userId: number): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.execute<(RowDataPacket & { c: number })[]>(
    `SELECT COUNT(*) AS c FROM \`${DEVICES_TABLE}\` WHERE user_id = ? AND revoked_at IS NULL`,
    [userId],
  );
  return Number(rows[0]?.c ?? 0);
}

async function findActiveDeviceByMac(
  userId: number,
  mac: string | undefined,
): Promise<DeviceRow | null> {
  const m = mac?.trim().toLowerCase();
  if (!m || m === "unknown") return null;
  const pool = getPool();
  const [rows] = await pool.execute<DeviceRow[]>(
    `SELECT * FROM \`${DEVICES_TABLE}\` WHERE user_id = ? AND revoked_at IS NULL`,
    [userId],
  );
  for (const row of rows) {
    const fp = parseFingerprint(row.user_fingerprint);
    if (fp?.mac?.trim().toLowerCase() === m) return row;
  }
  return null;
}

export type CepBearerUser = {
  id: number;
  email: string;
  name: string;
  deviceId: number;
  /** CEP client id from device registry (e.g. spunkram-cep). */
  client: string;
};

/**
 * Resolve `Authorization: Bearer mfcep_…` to a user + device.
 * Returns null for missing/invalid/revoked tokens.
 */
export async function resolveCepBearerUser(
  authorizationHeader: string | null | undefined,
): Promise<CepBearerUser | null> {
  const token = bearerTokenFromHeader(authorizationHeader);
  if (!token) return null;
  await ensureSchema();

  const pool = getPool();
  type JoinedRow = RowDataPacket & {
    device_id: number;
    user_id: number;
    email: string;
    name: string;
    client: string;
  };
  const [rows] = await pool.execute<JoinedRow[]>(
    `SELECT d.id AS device_id, u.id AS user_id, u.email, u.name, d.client
     FROM \`${DEVICES_TABLE}\` d
     JOIN users u ON u.id = d.user_id
     WHERE d.token_hash = ? AND d.revoked_at IS NULL
     LIMIT 1`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;

  void pool
    .execute(`UPDATE \`${DEVICES_TABLE}\` SET last_seen_at = NOW() WHERE id = ?`, [
      row.device_id,
    ])
    .catch(() => {});

  return {
    id: Number(row.user_id),
    email: row.email,
    name: row.name ?? "",
    deviceId: Number(row.device_id),
    client: String(row.client || "spunkram-cep"),
  };
}

/** Extract the raw token from an Authorization header; only accepts CEP tokens. */
export function bearerTokenFromHeader(
  header: string | null | undefined,
): string | null {
  if (typeof header !== "string") return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  if (!token || !token.startsWith("mfcep_")) return null;
  return token;
}

export type CepDeviceListItem = {
  id: string;
  ip: string;
  user_fingerprint: string;
  name?: string;
  current?: boolean;
};

export async function listDevicesForUser(
  userId: number,
  currentDeviceId?: number,
): Promise<CepDeviceListItem[]> {
  await ensureSchema();
  const pool = getPool();
  const [rows] = await pool.execute<DeviceRow[]>(
    `SELECT * FROM \`${DEVICES_TABLE}\`
     WHERE user_id = ? AND revoked_at IS NULL
     ORDER BY id ASC`,
    [userId],
  );
  return rows.map((r) => ({
    id: `dev_${r.id}`,
    ip: r.ip ?? "",
    user_fingerprint: r.user_fingerprint ?? "",
    name: r.name ?? undefined,
    current: currentDeviceId != null ? r.id === currentDeviceId : undefined,
  }));
}

/** Accepts both `dev_123` (API shape) and bare numeric ids. */
export function parseDeviceId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) return raw;
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(?:dev_)?(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Revoke a device owned by the user (revoking the current device is allowed). */
export async function revokeDevice(
  userId: number,
  deviceId: number,
): Promise<boolean> {
  await ensureSchema();
  const pool = getPool();
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE \`${DEVICES_TABLE}\`
     SET revoked_at = NOW()
     WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
    [deviceId, userId],
  );
  return res.affectedRows > 0;
}
