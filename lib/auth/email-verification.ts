import "server-only";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";

const TABLE = "email_verification_tokens";

/** Confirmation links expire after 24 hours. */
export const EMAIL_VERIFY_EXPIRE_HOURS = 24;

let ensured = false;

export async function ensureEmailVerificationTokensTable(): Promise<void> {
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

export function generateEmailVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function storeEmailVerificationToken(
  email: string,
  plainToken: string,
): Promise<void> {
  await ensureEmailVerificationTokensTable();
  const pool = getPool();
  const hashed = await bcrypt.hash(plainToken, 10);
  await pool.execute(
    `INSERT INTO \`${TABLE}\` (email, token, created_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE token = VALUES(token), created_at = VALUES(created_at)`,
    [normalizeEmail(email), hashed],
  );
}

export async function deleteEmailVerificationToken(email: string): Promise<void> {
  await ensureEmailVerificationTokensTable();
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

export async function hasPendingEmailVerification(email: string): Promise<boolean> {
  await ensureEmailVerificationTokensTable();
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT email FROM \`${TABLE}\` WHERE email = ? LIMIT 1`,
    [normalizeEmail(email)],
  );
  return rows.length > 0;
}

export async function verifyEmailVerificationToken(
  email: string,
  plainToken: string,
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "expired" }> {
  await ensureEmailVerificationTokensTable();
  const pool = getPool();
  const [rows] = await pool.execute<TokenRow[]>(
    `SELECT email, token, created_at FROM \`${TABLE}\` WHERE email = ? LIMIT 1`,
    [normalizeEmail(email)],
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
  if (Date.now() - created.getTime() > EMAIL_VERIFY_EXPIRE_HOURS * 60 * 60 * 1000) {
    return { ok: false, reason: "expired" };
  }

  const match = await bcrypt.compare(plainToken, row.token);
  if (!match) return { ok: false, reason: "invalid" };
  return { ok: true };
}
