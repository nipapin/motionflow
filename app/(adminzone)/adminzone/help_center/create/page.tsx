import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import { getHelpCategories } from "@/lib/admin/help-center";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { HelpCenterArticleForm } from "@/components/admin/help-center-form";

export const metadata: Metadata = { title: "New help article — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminHelpCenterCreatePage() {
  ensureInvestor(await getSessionUser());
  const categories = await getHelpCategories();
  if (categories.length === 0) {
    // Need at least one category before creating an article — punt back with a hint.
    redirect("/adminzone/help_center");
  }

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="New help article"
        description="Fill in title, category and HTML content. Slug is derived automatically when left blank."
        backHref="/adminzone/help_center"
        backLabel="Back to articles"
      />
      <Card className="border-border/60">
        <CardContent className="pt-6">
          <HelpCenterArticleForm categories={categories} />
        </CardContent>
      </Card>
    </div>
  );
}
