import bcrypt from "bcryptjs";
import { oauthPasswordOnlyFromGoogleId } from "@/lib/auth/users-table";

export type UserAuthRow = {
  password: string;
  email: string;
  name: string;
  google_id?: unknown;
};

export type AuthUserFlags = {
  hasGoogleLinked: boolean;
  oauthPasswordOnly: boolean;
  canChangePassword: boolean;
  canUnlinkGoogle: boolean;
};

/** Plain-text passwords Google OAuth sets on auto-created accounts (`GoogleController` parity). */
export function googleAutoPasswordCandidates(
  email: string,
  googleId: string,
  displayName?: string | null,
): string[] {
  const id = String(googleId).trim();
  if (!id) return [];
  const local = (email.split("@")[0] || "user").trim();
  const fromName = (displayName ?? "").trim();
  const candidates = new Set<string>();
  if (fromName) candidates.add(`${fromName}@${id}`);
  if (local) candidates.add(`${local}@${id}`);
  return [...candidates];
}

/** True when the stored hash matches the auto-generated Google sign-up password. */
export async function isGoogleAutoPasswordHash(
  row: UserAuthRow,
): Promise<boolean> {
  const googleId = row.google_id;
  if (googleId == null || String(googleId).trim() === "") return false;

  const candidates = googleAutoPasswordCandidates(
    row.email,
    String(googleId),
    row.name,
  );
  for (const plain of candidates) {
    if (await bcrypt.compare(plain, row.password)) return true;
  }
  return false;
}

/** Linked to Google but still has a user-chosen email/password (hybrid account). */
export async function canUnlinkGoogleAccount(row: UserAuthRow): Promise<boolean> {
  const flags = await resolveAuthUserFlags(row);
  return flags.canUnlinkGoogle;
}

/** Session/UI flags: Google-only vs hybrid (email+password + linked Google). */
export async function resolveAuthUserFlags(row: UserAuthRow): Promise<AuthUserFlags> {
  const hasGoogleLinked = oauthPasswordOnlyFromGoogleId(row);
  const oauthPasswordOnly =
    hasGoogleLinked && (await isGoogleAutoPasswordHash(row));
  return {
    hasGoogleLinked,
    oauthPasswordOnly,
    canChangePassword: !hasGoogleLinked,
    canUnlinkGoogle: hasGoogleLinked,
  };
}
