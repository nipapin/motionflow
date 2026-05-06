import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor, isAdmin } from "@/lib/auth/access-control";
import { getOfferById } from "@/lib/admin/offers";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { OfferForm } from "@/components/admin/offer-form";

export const metadata: Metadata = { title: "Edit offer — Admin" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ id?: string }> };

export default async function AdminOfferEditPage({ searchParams }: PageProps) {
  const u = await getSessionUser();
  ensureInvestor(u);
  if (!isAdmin(u)) redirect("/adminzone/offers");

  const sp = await searchParams;
  const id = Number(sp.id);
  if (!Number.isFinite(id) || id <= 0) notFound();
  const item = await getOfferById(id);
  if (!item) notFound();

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title={`Edit: ${item.short_title || item.title}`}
        description={`Offer #${item.id} · ${item.status_label} · updated ${item.updated_date}`}
        badge={{ label: item.visible === 1 ? "Live" : "Hidden", tone: item.visible === 1 ? "default" : "secondary" }}
        backHref="/adminzone/offers"
        backLabel="Back to offers"
      />
      <Card className="border-border/60">
        <CardContent className="pt-6">
          <OfferForm offer={item} />
        </CardContent>
      </Card>
    </div>
  );
}
