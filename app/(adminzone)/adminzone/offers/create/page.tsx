import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor, isAdmin } from "@/lib/auth/access-control";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { OfferForm } from "@/components/admin/offer-form";

export const metadata: Metadata = { title: "New offer — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminOfferCreatePage() {
  const u = await getSessionUser();
  ensureInvestor(u);
  if (!isAdmin(u)) redirect("/adminzone/offers");

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="New offer"
        description="Configure a promotional landing page (offer / collection / discount)."
        backHref="/adminzone/offers"
        backLabel="Back to offers"
      />
      <Card className="border-border/60">
        <CardContent className="pt-6">
          <OfferForm />
        </CardContent>
      </Card>
    </div>
  );
}
