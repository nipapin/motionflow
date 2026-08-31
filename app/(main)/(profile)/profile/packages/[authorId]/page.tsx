import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { PackagesAuthorWorkspace } from "@/components/packages-author-workspace";

export const metadata: Metadata = {
  title: "Authors",
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
  if (!(await getPackagesAuthorById(authorId))) notFound();

  return (
    <Suspense fallback={null}>
      <PackagesAuthorWorkspace authorId={authorId} />
    </Suspense>
  );
}
