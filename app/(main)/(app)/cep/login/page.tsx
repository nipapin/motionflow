import { redirect } from "next/navigation";
import {
  getCepClientConfig,
  normalizeCepClient,
} from "@/lib/cep-client-registry";
import { CepLoginClient } from "./cep-login-client";

export const dynamic = "force-dynamic";

/**
 * Device-code Allow/Deny page for CEP / DaVinci clients.
 * Author clients keep their marketing-page dialog via redirect; platform
 * clients (e.g. motionflow-davinci) confirm here.
 */
export default async function CepLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; client?: string }>;
}) {
  const { code, client: clientRaw } = await searchParams;
  const client = normalizeCepClient(clientRaw);
  const cfg = getCepClientConfig(client);

  if (cfg?.platformSubscription) {
    return <CepLoginClient initialCode={code ?? ""} initialClient={client} />;
  }

  const params = new URLSearchParams();
  if (code?.trim()) params.set("code", code.trim());
  params.set("client", client);
  const path = cfg?.verificationPath ?? "/spunkram";
  redirect(`${path}?${params.toString()}`);
}
