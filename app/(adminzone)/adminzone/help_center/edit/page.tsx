import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import { getHelpArticleById, getHelpCategories } from "@/lib/admin/help-center";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { HelpCenterArticleForm } from "@/components/admin/help-center-form";

export const metadata: Metadata = { title: "Edit help article — Admin" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ id?: string }> };

export default async function AdminHelpCenterEditPage({ searchParams }: PageProps) {
  ensureInvestor(await getSessionUser());
  const sp = await searchParams;
  const id = Number(sp.id);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const [article, categories] = await Promise.all([getHelpArticleById(id), getHelpCategories()]);
  if (!article) notFound();

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title={`Edit: ${article.title}`}
        description={`Article #${article.id} · last updated ${article.updated_date}`}
        badge={{ label: article.visible ? "Published" : "Hidden", tone: article.visible ? "default" : "secondary" }}
        backHref="/adminzone/help_center"
        backLabel="Back to articles"
      />
      <Card className="border-border/60">
        <CardContent className="pt-6">
          <HelpCenterArticleForm categories={categories} article={article} />
        </CardContent>
      </Card>
    </div>
  );
}
