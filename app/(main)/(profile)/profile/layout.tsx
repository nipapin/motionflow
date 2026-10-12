import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { AccountSidebar } from "@/components/account-sidebar";
import { isPackagesAdmin } from "@/lib/packages-admin";
import { affiliateNavFlags } from "@/lib/affiliate/nav";
import { ProfileWorkspaceLayout } from "@/components/profile-workspace-layout";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your Motion Flow profile and account pages.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfileSectionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    redirect("/");
  }
  const { showPartners, showUsers, showAffiliate } = await affiliateNavFlags();
  const showPackages = isPackagesAdmin(sessionUser.email);
  const admin = showPackages || showPartners || showUsers;

  return (
    <ProfileWorkspaceLayout admin={admin} sidebar={
        <AccountSidebar
          access={sessionUser.access}
          email={sessionUser.email}
          showPackages={showPackages}
          showPartners={showPartners}
          showUsers={showUsers}
          showAffiliate={showAffiliate}
        />
    }>
      {children}
    </ProfileWorkspaceLayout>
  );
}
