import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import { getTutorialById, getTutorialLocales } from "@/lib/admin/tutorials";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { TutorialForm } from "@/components/admin/tutorials-form";

export const metadata: Metadata = { title: "Edit tutorial — Admin" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ id?: string }> };

export default async function AdminTutorialEditPage({ searchParams }: PageProps) {
  ensureInvestor(await getSessionUser());
  const sp = await searchParams;
  const id = Number(sp.id);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const item = await getTutorialById(id);
  if (!item) notFound();
  const locales = await getTutorialLocales(id);

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title={`Edit: ${item.title}`}
        description={`Tutorial #${item.id} · ${item.category_slug} / ${item.sub_category_slug} · updated ${item.updated_date}`}
        badge={{ label: item.visible ? "Published" : "Hidden", tone: item.visible ? "default" : "secondary" }}
        backHref="/adminzone/tutorials"
        backLabel="Back to tutorials"
      />
      <Card className="border-border/60">
        <CardContent className="pt-6">
          <TutorialForm tutorial={item} locales={locales} />
        </CardContent>
      </Card>
    </div>
  );
}
