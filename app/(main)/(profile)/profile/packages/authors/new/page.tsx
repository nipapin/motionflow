import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import { PackagesAuthorCreate } from "@/components/packages-author-create";

export const metadata: Metadata = {
  title: "Add Author",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AddAuthorPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!isPackagesAdmin(user.email)) redirect("/profile");
  return <PackagesAuthorCreate />;
}
