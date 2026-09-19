import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { searchAdminUsers } from "@/lib/admin-users";
import { AdminUsersSearch } from "@/components/admin-users-search";

export const metadata: Metadata = {
  title: "Users",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!isAffiliateAdmin(user)) redirect("/profile");

  const initial = await searchAdminUsers({ page: 1 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground">Manage accounts, roles, and access.</p>
      </div>
      <AdminUsersSearch initial={initial} />
    </div>
  );
}
