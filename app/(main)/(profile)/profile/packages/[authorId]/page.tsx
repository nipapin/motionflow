import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { PackagesProjectList } from "@/components/packages-project-list";

export const metadata: Metadata = {
  title: "Packages — Author",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PackagesAuthorPage({
  params,
}: {
  params: Promise<{ authorId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!isPackagesAdmin(user.email)) redirect("/profile");

  const authorId = Number((await params).authorId);
  if (!getPackagesAuthorById(authorId)) notFound();

  return <PackagesProjectList authorId={authorId} />;
}
