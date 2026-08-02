import "server-only";

/**
 * Emails that may see Spunkram CEP beta updates and the Settings version picker.
 * Override / extend with env `SPUNKRAM_BETA_EMAILS` (comma-separated).
 */
const DEFAULT_BETA_EMAILS = [
  "basepackagehelp@gmail.com",
  "admin@mail.ru",
] as const;

export function spunkramBetaTesterEmails(): Set<string> {
  const set = new Set<string>(DEFAULT_BETA_EMAILS.map((e) => e.toLowerCase()));
  const fromEnv = process.env.SPUNKRAM_BETA_EMAILS?.trim();
  if (fromEnv) {
    for (const part of fromEnv.split(",")) {
      const e = part.trim().toLowerCase();
      if (e) set.add(e);
    }
  }
  return set;
}

export function isSpunkramBetaTester(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  return spunkramBetaTesterEmails().has(email.trim().toLowerCase());
}

/** Alias — admin Settings version switcher uses the same allowlist. */
export function isSpunkramReleaseAdmin(email: string | null | undefined): boolean {
  return isSpunkramBetaTester(email);
}
