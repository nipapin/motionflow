import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { CepDiagnostics } from "@/components/cep-diagnostics";

export const metadata: Metadata = { title: "CEP diagnostics", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CepDiagnosticsPage() {
  if (!isAffiliateAdmin(await getSessionUser())) redirect("/profile");
  return <CepDiagnostics />;
}
