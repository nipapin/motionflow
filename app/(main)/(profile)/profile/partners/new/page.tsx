import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { PartnerCreateForm } from "@/components/partner-create-form";

export const metadata: Metadata = {
  title: "New partner",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewPartnerPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!isAffiliateAdmin(user)) redirect("/profile");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/profile/partners"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Partners
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Create partner</h1>
        <p className="text-muted-foreground">
          Generates a referral link and, for new emails, sends an invite to set a password.
        </p>
      </div>

      <PartnerCreateForm />
    </div>
  );
}
