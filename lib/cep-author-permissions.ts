import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import { getCepClientConfig, type CepClientConfig } from "@/lib/cep-client-registry";
import { resolveOdinAiUser } from "@/lib/odin-ai";

export type CepPermissions = { admin: boolean; beta_updates: boolean };
type CepPermissionIdentity = { provider: "motionflow" | "odin"; subjectId: string };
type PermissionRow = RowDataPacket & { permission: "admin" | "beta_updates" };

/** No email, client, author or role supplied by the panel is an identity. */
export async function resolveCepPermissionContext(authorization: string | null) {
  if (!authorization) return null;
  let identity: CepPermissionIdentity;
  let cfg: CepClientConfig | null;
  if (/^Bearer odincep_[a-f0-9]{64}$/.test(authorization)) {
    const user = await resolveOdinAiUser(authorization);
    if (!user) return null;
    identity = { provider: "odin", subjectId: user.id.slice("odin:".length) };
    cfg = getCepClientConfig(user.cepClient);
  } else {
    const user = await resolveCepBearerUser(authorization);
    if (!user) return null;
    identity = { provider: "motionflow", subjectId: String(user.id) };
    cfg = getCepClientConfig(user.client);
  }
  if (!cfg) return null;
  return { cfg, permissions: await getCepAuthorPermissions(identity, cfg.authorId) };
}

export async function getCepAuthorPermissions(
  identity: CepPermissionIdentity,
  authorId: number,
): Promise<CepPermissions> {
  let rows: PermissionRow[];
  try {
    [rows] = await getPool().execute<PermissionRow[]>(
      `SELECT permission FROM cep_author_permissions
       WHERE author_id = ? AND identity_provider = ? AND subject_id = ? AND revoked_at IS NULL`,
      [authorId, identity.provider, identity.subjectId],
    );
  } catch (error) {
    // Before migration deployment, deny admin without breaking ordinary profiles.
    if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") {
      return { admin: false, beta_updates: false };
    }
    throw error;
  }
  const admin = rows.some(row => row.permission === "admin");
  return { admin, beta_updates: admin || rows.some(row => row.permission === "beta_updates") };
}
