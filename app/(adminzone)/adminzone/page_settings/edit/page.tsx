import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor, isAdmin } from "@/lib/auth/access-control";
import { getPageSettingById } from "@/lib/admin/page-settings";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { PageSettingForm } from "@/components/admin/page-setting-form";

export const metadata: Metadata = { title: "Edit page setting — Admin" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ id?: string }> };

export default async function AdminPageSettingsEditPage({ searchParams }: PageProps) {
  const u = await getSessionUser();
  ensureInvestor(u);
  if (!isAdmin(u)) redirect("/adminzone/page_settings");

  const sp = await searchParams;
  const id = Number(sp.id);
  if (!Number.isFinite(id) || id <= 0) notFound();
  const item = await getPageSettingById(id);
  if (!item) notFound();

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title={`Edit: ${item.page} / ${item.key}`}
        description={`Setting #${item.id} · created ${item.created_date}`}
        backHref="/adminzone/page_settings"
        backLabel="Back to settings"
      />
      <Card className="border-border/60">
        <CardContent className="pt-6">
          <PageSettingForm setting={item} />
        </CardContent>
      </Card>
    </div>
  );
}
