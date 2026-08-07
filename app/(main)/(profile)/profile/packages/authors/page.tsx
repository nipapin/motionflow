import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import { PackagesAuthorsAdmin } from "@/components/packages-authors-admin";

export const metadata: Metadata = {
  title: "Packages — Authors",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PackagesAuthorsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!isPackagesAdmin(user.email)) redirect("/profile");

  return <PackagesAuthorsAdmin />;
}
