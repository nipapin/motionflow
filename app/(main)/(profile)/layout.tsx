import { ProfileShell } from "@/components/profile-shell";
import { affiliateNavFlags } from "@/lib/affiliate/nav";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";

export default async function ProfileShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Header dropdown links are gated server-side; `affiliateNavFlags` is cached
  // per request, so the sidebar layout below reuses this same lookup.
  const { showPartners, showUsers, showAffiliate } = await affiliateNavFlags();
  const user = await getSessionUser();
  const admin = showPartners || showUsers || isPackagesAdmin(user?.email);

  return (
    <ProfileShell
      showPartners={showPartners}
      showUsers={showUsers}
      showAffiliate={showAffiliate}
      admin={admin}
    >
      {children}
    </ProfileShell>
  );
}
