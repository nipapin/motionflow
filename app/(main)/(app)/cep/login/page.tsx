import type { Metadata } from "next";
import {
  getCepClientConfig,
  normalizeCepClient,
} from "@/lib/cep-client-registry";
import { CepLoginClient } from "./cep-login-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; client?: string }>;
}): Promise<Metadata> {
  const { client: clientRaw } = await searchParams;
  const cfg = getCepClientConfig(normalizeCepClient(clientRaw));
  const title = cfg?.loginTitle ?? "Sign in to the Spunkram extension";
  return {
    title: "Confirm extension sign-in",
    description: title,
    robots: { index: false },
  };
}

export default async function CepLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; client?: string }>;
}) {
  const { code, client: clientRaw } = await searchParams;
  const client = normalizeCepClient(clientRaw);
  return <CepLoginClient initialCode={code ?? ""} initialClient={client} />;
}
