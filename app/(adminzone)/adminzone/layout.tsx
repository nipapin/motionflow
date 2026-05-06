import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata: Metadata = {
  title: "Admin zone",
  description: "Staff dashboard — moderation, requests, and analytics.",
};

export const dynamic = "force-dynamic";

export default async function AdminZoneLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = ensureInvestor(await getSessionUser());

  return (
    <AdminShell access={user.access} userName={user.name}>
      {children}
    </AdminShell>
  );
}
