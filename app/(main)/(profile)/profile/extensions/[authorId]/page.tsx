import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { ExtensionsUsersList } from "@/components/extensions-users-list";

export const metadata: Metadata = {
  title: "Extensions Users — Author",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

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

  return <ExtensionsUsersList authorId={authorId} />;
}
