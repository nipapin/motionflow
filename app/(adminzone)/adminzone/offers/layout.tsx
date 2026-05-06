import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureAdmin } from "@/lib/auth/access-control";

export default async function AdminOffersLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  ensureAdmin(await getSessionUser());
  return <>{children}</>;
}
