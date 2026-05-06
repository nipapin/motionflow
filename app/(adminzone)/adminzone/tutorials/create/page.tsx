import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { TutorialForm } from "@/components/admin/tutorials-form";

export const metadata: Metadata = { title: "New tutorial — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminTutorialCreatePage() {
  ensureInvestor(await getSessionUser());
  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="New tutorial"
        description="Create a tutorial for the `tuts.` subdomain. Slug is derived from title when blank."
        backHref="/adminzone/tutorials"
        backLabel="Back to tutorials"
      />
      <Card className="border-border/60">
        <CardContent className="pt-6">
          <TutorialForm />
        </CardContent>
      </Card>
    </div>
  );
}
