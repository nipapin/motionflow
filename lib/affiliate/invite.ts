import "server-only";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import {
  generatePasswordResetToken,
  storePasswordResetToken,
} from "@/lib/auth/password-reset";
import { sendAffiliateInviteEmail } from "@/lib/auth/password-reset-mailer";
import { markAffiliateInviteSent } from "@/lib/affiliate/db";
import { affiliateRefLink } from "@/lib/affiliate/shared";
import type { Affiliate } from "@/lib/affiliate/types";

const USERS_TABLE = "users";

/** `users.name` is the public username, so invited partners need a free one. */
async function uniqueUsername(base: string): Promise<string> {
  const pool = getPool();
  let candidate = (base.slice(0, 40) || "partner").replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!candidate) candidate = "partner";
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

export type AffiliateInviteResult =
  | { sent: true; createdUser: boolean; userId: number }
  | { sent: false; reason: "already_has_account" };

/**
 * Invite flow, mirroring the author-access grant: create a shell account when
 * the email is new, then send a "set your password" link backed by
 * `password_reset_tokens` (7-day expiry via `source=invite`).
 *
 * When the email already belongs to an account there is nothing to invite — the
 * Affiliate tab shows up on their next visit (`getAffiliateForUser` links the
 * partner row by email).
 */
export async function sendAffiliatePartnerInvite(opts: {
  affiliate: Affiliate;
  siteOrigin?: string;
}): Promise<AffiliateInviteResult> {
  const { affiliate } = opts;
  const pool = getPool();

  const [existing] = await pool.execute<(RowDataPacket & { id: number; name: string })[]>(
    `SELECT id, name FROM \`${USERS_TABLE}\` WHERE email = ? LIMIT 1`,
    [affiliate.email],
  );
  if (existing[0]) {
    return { sent: false, reason: "already_has_account" };
  }

  const local = affiliate.email.split("@")[0] || "partner";
  const username = await uniqueUsername(local);
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10);

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO \`${USERS_TABLE}\`
       (name, email, password, mailing, email_verified_at, created_at, updated_at)
     VALUES (?, ?, ?, 0, NOW(), NOW(), NOW())`,
    [username, affiliate.email, passwordHash],
  );
  const userId = Number(result.insertId);

  await pool.execute<ResultSetHeader>(
    `UPDATE \`affiliates\` SET user_id = ?, updated_at = NOW() WHERE id = ? AND user_id IS NULL`,
    [userId, affiliate.id],
  );

  const token = generatePasswordResetToken();
  await storePasswordResetToken(affiliate.email, token);
  await sendAffiliateInviteEmail({
    email: affiliate.email,
    token,
    name: affiliate.name || username,
    refLink: affiliateRefLink(affiliate.slug),
    commissionPercent: affiliate.commissionPercent,
    siteOrigin: opts.siteOrigin,
  });
  await markAffiliateInviteSent(affiliate.id);

  return { sent: true, createdUser: true, userId };
}
