import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor, isAdmin } from "@/lib/auth/access-control";
import {
  ADMIN_OFFERS_PER_PAGE,
  getOffersAdminPage,
} from "@/lib/admin/offers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { OffersTable } from "@/components/admin/offers-table";

export const metadata: Metadata = { title: "Offers — Admin" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ page?: string }> };

export default async function AdminOffersPage({ searchParams }: PageProps) {
  const u = await getSessionUser();
  ensureInvestor(u);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await getOffersAdminPage(page);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_OFFERS_PER_PAGE));

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="Offers"
        description="Promotional landing pages and curated collections (`offer_pages`). Mirrors Laravel `Admin\\Offer`."
        badge={{ label: `${total} offer${total === 1 ? "" : "s"}` }}
        actions={
          isAdmin(u) ? (
            <Button asChild size="sm">
              <Link href="/adminzone/offers/create">
                <Plus className="size-4" />
                New offer
              </Link>
            </Button>
          ) : null
        }
      />

      <Card className="border-border/60">
        <CardContent className="space-y-4 pt-4">
          <OffersTable rows={rows} />
          <AdminPagination
            page={page}
            totalPages={totalPages}
            hrefFor={(p) => `/adminzone/offers?page=${p}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
