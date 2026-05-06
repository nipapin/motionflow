import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor, isAdmin } from "@/lib/auth/access-control";
import { getMailingById } from "@/lib/admin/mailing";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { MailingForm } from "@/components/admin/mailing-form";

export const metadata: Metadata = { title: "Edit mailing — Admin" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ id?: string }> };

export default async function AdminMailingEditPage({ searchParams }: PageProps) {
  const u = await getSessionUser();
  ensureInvestor(u);
  if (!isAdmin(u)) redirect("/adminzone/mailing_marketing");

  const sp = await searchParams;
  const id = Number(sp.id);
  if (!Number.isFinite(id) || id <= 0) notFound();
  const item = await getMailingById(id);
  if (!item) notFound();

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title={`Edit: ${item.title}`}
        description={`Mailing #${item.id} · ${item.status_label} · audience ${item.parsed_emails ?? "?"}`}
        badge={{ label: item.status === 1 ? "Sent" : "Draft", tone: item.status === 1 ? "default" : "secondary" }}
        backHref="/adminzone/mailing_marketing"
        backLabel="Back to mailing"
      />
      <Card className="border-border/60">
        <CardContent className="pt-6">
          <MailingForm mailing={item} />
        </CardContent>
      </Card>
    </div>
  );
}
