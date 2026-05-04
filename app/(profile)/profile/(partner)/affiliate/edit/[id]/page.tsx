import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getShortLinkById } from "@/lib/author/affiliate";
import { AffiliateForm } from "@/components/author/affiliate-form";

type PageProps = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Edit affiliate #${id}` };
}

export default async function AffiliateEditPage({ params }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isFinite(id)) notFound();
  const row = await getShortLinkById(user.id, id);
  if (!row) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit affiliate link</h1>
        <p className="text-muted-foreground">Link slug stays the same; you can change redirect and comment.</p>
      </div>
      <AffiliateForm mode="edit" id={id} defaults={{ redirect: row.redirect, comment: row.comment ?? "" }} />
    </div>
  );
}
