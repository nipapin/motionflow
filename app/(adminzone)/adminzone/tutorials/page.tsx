import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import { TUTORIALS_PER_PAGE, getTutorialsPage } from "@/lib/admin/tutorials";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { TutorialsTable } from "@/components/admin/tutorials-table";

export const metadata: Metadata = { title: "Tutorials — Admin" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ page?: string }> };

export default async function AdminTutorialsPage({ searchParams }: PageProps) {
  ensureInvestor(await getSessionUser());
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await getTutorialsPage(page);
  const totalPages = Math.max(1, Math.ceil(total / TUTORIALS_PER_PAGE));

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="Tutorials"
        description="CMS for the `tuts.motionflow.pro` subdomain. Mirrors Laravel `Admin\\Tutorials` (Editor.js + locales parity is on the roadmap)."
        badge={{ label: `${total} entr${total === 1 ? "y" : "ies"}` }}
        actions={
          <Button asChild size="sm">
            <Link href="/adminzone/tutorials/create">
              <Plus className="size-4" />
              New tutorial
            </Link>
          </Button>
        }
      />
      <Card className="border-border/60">
        <CardContent className="space-y-4 pt-4">
          <TutorialsTable rows={rows} />
          <AdminPagination
            page={page}
            totalPages={totalPages}
            hrefFor={(p) => `/adminzone/tutorials?page=${p}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
