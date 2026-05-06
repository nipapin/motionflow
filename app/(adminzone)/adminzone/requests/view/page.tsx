import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import { getRequestById } from "@/lib/admin/requests";
import { RequestDetailPanel } from "@/components/admin/request-detail-panel";

export const metadata: Metadata = {
  title: "Request — Admin",
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function AdminRequestViewPage({ searchParams }: PageProps) {
  const user = ensureInvestor(await getSessionUser());
  const sp = await searchParams;
  const id = Number(sp.id);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const detail = await getRequestById(id);
  if (!detail) notFound();

  return <RequestDetailPanel detail={detail} currentStaffId={user.id} />;
}
