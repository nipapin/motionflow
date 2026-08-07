import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";

export const metadata: Metadata = {
  title: "Packages — Authors",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Settings live on each author projects page; keep this route as a redirect. */
export default async function PackagesAuthorsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!isPackagesAdmin(user.email)) redirect("/profile");
  redirect("/profile/packages");
}
