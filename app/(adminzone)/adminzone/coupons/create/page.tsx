import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { CouponForm } from "@/components/admin/coupon-form";

export const metadata: Metadata = { title: "New coupon — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminCouponCreatePage() {
  ensureInvestor(await getSessionUser());

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="New coupon"
        description="Create a coupon code that will be available for cart redemption."
        backHref="/adminzone/coupons"
        backLabel="Back to coupons"
      />
      <Card className="border-border/60">
        <CardContent className="pt-6">
          <CouponForm />
        </CardContent>
      </Card>
    </div>
  );
}
