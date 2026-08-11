import { redirect } from "next/navigation";
import {
  DEFAULT_CEP_CLIENT,
  getCepClientConfig,
  normalizeCepClient,
} from "@/lib/cep-client-registry";
import { CepLoginClient } from "./cep-login-client";

export const dynamic = "force-dynamic";

/**
 * Device-code Allow/Deny page for CEP / DaVinci clients.
 * Spunkram keeps its marketing-page dialog via redirect; platform clients
 * (e.g. motionflow-davinci) confirm here.
 */
export default async function CepLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; client?: string }>;
}) {
  const { code, client: clientRaw } = await searchParams;
  const client = normalizeCepClient(clientRaw);
  const cfg = getCepClientConfig(client);

  // Legacy Spunkram flow: confirm dialog lives on the author landing page.
  if (!cfg || cfg.client === DEFAULT_CEP_CLIENT || !cfg.platformSubscription) {
    const params = new URLSearchParams();
    if (code?.trim()) params.set("code", code.trim());
    params.set("client", client);
    redirect(`/spunkram?${params.toString()}`);
  }

  return <CepLoginClient initialCode={code ?? ""} initialClient={client} />;
}
