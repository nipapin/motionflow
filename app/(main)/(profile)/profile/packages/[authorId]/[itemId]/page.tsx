import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { PackagesProjectEditor } from "@/components/packages-project-editor";

export const metadata: Metadata = {
  title: "Packages — Project",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PackagesProjectPage({
  params,
}: {
  params: Promise<{ authorId: string; itemId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!isPackagesAdmin(user.email)) redirect("/profile");

  const { authorId: authorRaw, itemId: itemRaw } = await params;
  const authorId = Number(authorRaw);
  const itemId = Number(itemRaw);
  if (!getPackagesAuthorById(authorId) || !Number.isFinite(itemId) || itemId <= 0) {
    notFound();
  }

  return <PackagesProjectEditor authorId={authorId} itemId={itemId} />;
}
