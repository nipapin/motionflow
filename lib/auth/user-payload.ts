import { resolveAuthUserFlags, type AuthUserFlags, type UserAuthRow } from "@/lib/auth/google-account";

export type AuthUserPayload = {
  id: number;
  email: string;
  name: string;
} & AuthUserFlags;

/** Session/API user object with Google-link flags from the database row. */
export async function authUserPayloadFromRow(
  row: UserAuthRow & { id: number; email: string; name: string },
): Promise<AuthUserPayload> {
  const flags = await resolveAuthUserFlags(row);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    ...flags,
  };
}
