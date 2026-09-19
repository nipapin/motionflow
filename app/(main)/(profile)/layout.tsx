import { ProfileShell } from "@/components/profile-shell";
import { affiliateNavFlags } from "@/lib/affiliate/nav";

export default async function ProfileShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Header dropdown links are gated server-side; `affiliateNavFlags` is cached
  // per request, so the sidebar layout below reuses this same lookup.
  const { showPartners, showUsers, showAffiliate } = await affiliateNavFlags();

  return (
    <ProfileShell
      showPartners={showPartners}
      showUsers={showUsers}
      showAffiliate={showAffiliate}
    >
      {children}
    </ProfileShell>
  );
}
