import "server-only";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";

const TABLE = "password_reset_tokens";

/** Laravel-style default: reset links expire after 60 minutes. */
export const PASSWORD_RESET_EXPIRE_MINUTES = 60;

let ensured = false;

export async function ensurePasswordResetTokensTable(): Promise<void> {
  if (ensured) return;
  const pool = getPool();
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
      \`email\` varchar(255) NOT NULL,
      \`token\` varchar(255) NOT NULL,
      \`created_at\` timestamp NULL DEFAULT NULL,
      PRIMARY KEY (\`email\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Opaque token for the email link (plain). Stored hash goes in DB. */
export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function storePasswordResetToken(
  email: string,
  plainToken: string,
): Promise<void> {
  await ensurePasswordResetTokensTable();
  const pool = getPool();
  const normalized = normalizeEmail(email);
  const hashed = await bcrypt.hash(plainToken, 10);
  await pool.execute(
    `INSERT INTO \`${TABLE}\` (email, token, created_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE token = VALUES(token), created_at = VALUES(created_at)`,
    [normalized, hashed],
  );
}

export async function deletePasswordResetToken(email: string): Promise<void> {
  await ensurePasswordResetTokensTable();
  const pool = getPool();
  await pool.execute(`DELETE FROM \`${TABLE}\` WHERE email = ?`, [
    normalizeEmail(email),
  ]);
}

type TokenRow = RowDataPacket & {
  email: string;
  token: string;
  created_at: Date | string;
};

export async function verifyPasswordResetToken(
  email: string,
  plainToken: string,
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "expired" }> {
  await ensurePasswordResetTokensTable();
  const pool = getPool();
  const normalized = normalizeEmail(email);
  const [rows] = await pool.execute<TokenRow[]>(
    `SELECT email, token, created_at FROM \`${TABLE}\` WHERE email = ? LIMIT 1`,
    [normalized],
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: "invalid" };

  const created =
    row.created_at instanceof Date
      ? row.created_at
      : new Date(String(row.created_at));
  if (!Number.isFinite(created.getTime())) {
    return { ok: false, reason: "invalid" };
  }
  const ageMs = Date.now() - created.getTime();
  if (ageMs > PASSWORD_RESET_EXPIRE_MINUTES * 60_000) {
    return { ok: false, reason: "expired" };
  }

  const match = await bcrypt.compare(plainToken, row.token);
  if (!match) return { ok: false, reason: "invalid" };
  return { ok: true };
}
