import type { RowDataPacket } from "mysql2";

/**
 * Treat non-empty `google_id` like the old `oauth_password_only` flag:
 * profile/password rules for Google-linked accounts.
 */
export function oauthPasswordOnlyFromGoogleId(
  row: RowDataPacket & { google_id?: unknown },
): boolean {
  const v = row.google_id;
  if (v == null) return false;
  return String(v).trim().length > 0;
}
