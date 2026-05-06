import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor, isAdmin } from "@/lib/auth/access-control";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { PageSettingForm } from "@/components/admin/page-setting-form";

export const metadata: Metadata = { title: "New page setting — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPageSettingsCreatePage() {
  const u = await getSessionUser();
  ensureInvestor(u);
  if (!isAdmin(u)) redirect("/adminzone/page_settings");

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="New page setting"
        description="Add a JSON / text snippet that public pages can pull at runtime."
        backHref="/adminzone/page_settings"
        backLabel="Back to settings"
      />
      <Card className="border-border/60">
        <CardContent className="pt-6">
          <PageSettingForm />
        </CardContent>
      </Card>
    </div>
  );
}
