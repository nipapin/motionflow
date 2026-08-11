import "server-only";

import type { NextRequest } from "next/server";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import {
  getSessionUser,
  loadUserById,
  type SessionUser,
} from "@/lib/auth/get-session-user";

/**
 * Resolve the caller for marketplace / AI / account APIs:
 * 1) CEP device Bearer (`Authorization: Bearer mfcep_…`) — DaVinci / Adobe panels
 * 2) Web session cookie — browser
 */
export async function resolveRequestUser(
  req?: NextRequest | null,
): Promise<SessionUser | null> {
  if (req) {
    const bearer = await resolveCepBearerUser(req.headers.get("authorization"));
    if (bearer) {
      return loadUserById(bearer.id);
    }
  }
  return getSessionUser();
}

export function requestHasCepBearer(req: NextRequest): boolean {
  const h = req.headers.get("authorization");
  if (!h) return false;
  return /^Bearer\s+mfcep_/i.test(h.trim());
}
