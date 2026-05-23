import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensurePartner } from "@/lib/auth/access-control";

export default async function PartnerAuthorShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  ensurePartner(user);
  return <div className="space-y-8">{children}</div>;
}
