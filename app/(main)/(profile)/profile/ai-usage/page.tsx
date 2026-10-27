import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { AiUsageDashboard } from "@/components/ai-usage-dashboard";

export const metadata: Metadata = { title: "AI Usage", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function AiUsagePage() {
  if (!isAffiliateAdmin(await getSessionUser())) redirect("/profile");
  return <AiUsageDashboard />;
}
