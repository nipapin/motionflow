import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { AccountSidebar } from "@/components/account-sidebar";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your Motion Flow profile and account pages.",
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
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <aside className="shrink-0 lg:w-56">
        <AccountSidebar />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
