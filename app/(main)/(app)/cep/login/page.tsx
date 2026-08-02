import { redirect } from "next/navigation";
import { normalizeCepClient } from "@/lib/cep-client-registry";

export const dynamic = "force-dynamic";

/**
 * Legacy CEP confirm URL — redirect to Spunkram marketing page + auth dialog.
 * @see /spunkram?code=&client=
 */
export default async function CepLoginRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; client?: string }>;
}) {
  const { code, client: clientRaw } = await searchParams;
  const params = new URLSearchParams();
  if (code?.trim()) params.set("code", code.trim());
  params.set("client", normalizeCepClient(clientRaw));
  redirect(`/spunkram?${params.toString()}`);
}
