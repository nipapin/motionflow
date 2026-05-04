import type { Metadata } from "next";
import { AffiliateForm } from "@/components/author/affiliate-form";

export const metadata: Metadata = {
  title: "Create affiliate link",
};

export default function AffiliateCreatePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create affiliate link</h1>
        <p className="text-muted-foreground">Must point to a URL on the main marketplace host.</p>
      </div>
      <AffiliateForm mode="create" />
    </div>
  );
}
