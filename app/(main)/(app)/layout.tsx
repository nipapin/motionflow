import { headers } from "next/headers";
import { AppChrome } from "@/components/app-chrome";
import { marketplaceSaleHost } from "@/lib/marketplace-black-friday";

export default async function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { allowed } = marketplaceSaleHost(await headers());
  return <AppChrome saleInitialTime={allowed ? Date.now() : null}>{children}</AppChrome>;
}
