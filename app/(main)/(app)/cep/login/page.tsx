import type { Metadata } from "next";
import { CepLoginClient } from "./cep-login-client";

export const metadata: Metadata = {
  title: "Confirm extension sign-in",
  description: "Approve the sign-in request from the Motionflow extension.",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function CepLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return <CepLoginClient initialCode={code ?? ""} />;
}
