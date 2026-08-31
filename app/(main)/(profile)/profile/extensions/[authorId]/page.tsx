import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";

export const metadata: Metadata = {
  title: "Extensions Users — Author",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Users live as a tab on the author packages page. */
export default async function ExtensionsAuthorPage({
  params,
}: {
  params: Promise<{ authorId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!isPackagesAdmin(user.email)) redirect("/profile");

  const authorId = Number((await params).authorId);
  if (!(await getPackagesAuthorById(authorId))) notFound();

  redirect(`/profile/packages/${authorId}?tab=users`);
}
