import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { AdminCampaigns } from "@/components/admin-campaigns";
export const metadata:Metadata={title:"Campaigns",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default async function CampaignsPage() {
  const user=await getSessionUser();
  if (!user || !isAffiliateAdmin(user)) redirect("/profile");
  return <AdminCampaigns />;
}
