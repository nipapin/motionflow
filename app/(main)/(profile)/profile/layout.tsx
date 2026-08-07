import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { AccountSidebar } from "@/components/account-sidebar";
import { isPackagesAdmin } from "@/lib/packages-admin";

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

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <aside className="shrink-0 lg:w-60 lg:sticky lg:top-22 lg:self-start">
        <AccountSidebar
          access={sessionUser.access}
          email={sessionUser.email}
          showPackages={isPackagesAdmin(sessionUser.email)}
        />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
