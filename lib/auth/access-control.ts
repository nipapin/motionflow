import "server-only";
import { redirect } from "next/navigation";
import type { SessionUser } from "@/lib/auth/get-session-user";

/** Laravel `users.access`: 0 = buyer, 1+ = partner, 2+ = author/contributor, 100 = admin. */
export function isPartner(user: SessionUser | null): boolean {
  return user != null && user.access >= 1;
}

export function isAuthor(user: SessionUser | null): boolean {
  return user != null && user.access >= 2;
}

export function isAdmin(user: SessionUser | null): boolean {
  return user != null && user.access === 100;
}

/** Use from Server Components / layouts only. */
export function ensurePartner(user: SessionUser | null): SessionUser {
  if (!user || user.access < 1) redirect("/profile");
  return user;
}

/** Use from Server Components / layouts only. */
export function ensureAuthor(user: SessionUser | null): SessionUser {
  if (!user || user.access < 2) redirect("/profile");
  return user;
}
