import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureAuthor } from "@/lib/auth/access-control";

export default async function CreatorShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  ensureAuthor(user);
  return <div className="space-y-8 pb-2">{children}</div>;
}
