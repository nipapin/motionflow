import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import { getCouponById } from "@/lib/admin/coupons";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { CouponForm } from "@/components/admin/coupon-form";

export const metadata: Metadata = { title: "Edit coupon — Admin" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ id?: string }> };

export default async function AdminCouponEditPage({ searchParams }: PageProps) {
  ensureInvestor(await getSessionUser());
  const sp = await searchParams;
  const id = Number(sp.id);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const item = await getCouponById(id);
  if (!item) notFound();

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title={`Edit: ${item.code}`}
        description={`Coupon #${item.id} · ${item.uses} use${item.uses === 1 ? "" : "s"} · created ${item.created_date}`}
        badge={{ label: item.status === 1 ? "Enabled" : "Disabled", tone: item.status === 1 ? "default" : "secondary" }}
        backHref="/adminzone/coupons"
        backLabel="Back to coupons"
      />
      <Card className="border-border/60">
        <CardContent className="pt-6">
          <CouponForm coupon={item} />
        </CardContent>
      </Card>
    </div>
  );
}
