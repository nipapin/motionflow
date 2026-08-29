import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import { ExtensionsAuthorsHome } from "@/components/extensions-authors-home";

export const metadata: Metadata = {
  title: "Extensions Users",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfileExtensionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!isPackagesAdmin(user.email)) redirect("/profile");

  return <ExtensionsAuthorsHome />;
}
