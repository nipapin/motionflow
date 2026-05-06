import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor, isAdmin } from "@/lib/auth/access-control";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { MailingForm } from "@/components/admin/mailing-form";

export const metadata: Metadata = { title: "New mailing — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminMailingCreatePage() {
  const u = await getSessionUser();
  ensureInvestor(u);
  if (!isAdmin(u)) redirect("/adminzone/mailing_marketing");

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="New mailing"
        description="Compose a newsletter campaign and target an audience."
        backHref="/adminzone/mailing_marketing"
        backLabel="Back to mailing"
      />
      <Card className="border-border/60">
        <CardContent className="pt-6">
          <MailingForm />
        </CardContent>
      </Card>
    </div>
  );
}
