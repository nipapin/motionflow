import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import { PackagesAuthorsHome } from "@/components/packages-authors-home";

export const metadata: Metadata = {
  title: "Packages",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfilePackagesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!isPackagesAdmin(user.email)) redirect("/profile");

  return <PackagesAuthorsHome />;
}
