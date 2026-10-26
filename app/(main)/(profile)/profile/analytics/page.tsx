import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { MarketAnalyticsDashboard } from "@/components/market-analytics-dashboard";
export const metadata: Metadata = { title: "Market analytics", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function MarketAnalyticsPage() {
  if (!isAffiliateAdmin(await getSessionUser())) redirect("/profile");
  return <MarketAnalyticsDashboard />;
}
