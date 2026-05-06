import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import {
  HELP_ARTICLES_PER_PAGE,
  HELP_SECTIONS,
  getHelpArticlesPage,
  getHelpCategories,
} from "@/lib/admin/help-center";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { HelpCenterTable } from "@/components/admin/help-center-table";
import {
  HelpCategoryQuickAdd,
  HelpCategoryRow,
} from "@/components/admin/help-center-form";

export const metadata: Metadata = {
  title: "Help center — Admin",
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AdminHelpCenterPage({ searchParams }: PageProps) {
  ensureInvestor(await getSessionUser());
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ rows, total }, categories] = await Promise.all([
    getHelpArticlesPage(page),
    getHelpCategories(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / HELP_ARTICLES_PER_PAGE));

  const categoriesBySection = HELP_SECTIONS.map((s) => ({
    ...s,
    items: categories.filter((c) => c.section_slug === s.slug),
  }));

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="Help center"
        description="CRUD parity with Laravel `Admin\\HelpSection`. Editor.js authoring is on the roadmap — pasted HTML is saved as-is."
        badge={{ label: `${total} article${total === 1 ? "" : "s"}` }}
        actions={
          <Button asChild size="sm">
            <Link href="/adminzone/help_center/create">
              <Plus className="size-4" />
              New article
            </Link>
          </Button>
        }
      />

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-sm font-semibold">Categories</CardTitle>
          <HelpCategoryQuickAdd sections={HELP_SECTIONS} />
        </CardHeader>
        <CardContent className="space-y-4">
          {categoriesBySection.map((sec) => (
            <div key={sec.slug} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {sec.title} <span className="text-muted-foreground/70">({sec.items.length})</span>
              </h3>
              {sec.items.length === 0 ? (
                <p className="text-xs text-muted-foreground">No categories in this section yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {sec.items.map((c) => (
                    <HelpCategoryRow key={c.id} category={c} />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Articles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <HelpCenterTable rows={rows} />
          <AdminPagination
            page={page}
            totalPages={totalPages}
            hrefFor={(p) => `/adminzone/help_center?page=${p}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
