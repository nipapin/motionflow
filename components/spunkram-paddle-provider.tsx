"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { Environments } from "@paddle/paddle-js";
import { PaddleProvider } from "@/lib/paddle";

type CheckoutConfig = {
  token: string;
  environment: Environments | null;
};

export function SpunkramPaddleProvider({
  children,
  storefront,
  oneTimeCheckout,
  localSandboxPreview,
  sandboxBuyerIds,
}: {
  children: ReactNode;
  storefront: CheckoutConfig;
  oneTimeCheckout: CheckoutConfig;
  localSandboxPreview: boolean;
  sandboxBuyerIds?: number[];
}) {
  const pathname = usePathname() ?? "";
  const isItemPage = /^\/(?:spunkram\/)?item\//.test(pathname);
  const checkout = isItemPage ? oneTimeCheckout : storefront;
  const identity = JSON.stringify([checkout.environment, checkout.token, !isItemPage && localSandboxPreview]);
  const initialIdentity = useRef(identity);
  const accountChanged = initialIdentity.current !== identity;

  useEffect(() => {
    // Paddle authenticates once per document. Changing accounts needs a new page.
    if (accountChanged) window.location.reload();
  }, [accountChanged]);

  return (
    <PaddleProvider
      key={identity}
      token={checkout.token}
      environment={accountChanged ? null : checkout.environment}
      localSandboxPreview={!isItemPage && localSandboxPreview}
      sandboxBuyerIds={isItemPage ? undefined : sandboxBuyerIds}
    >
      {children}
    </PaddleProvider>
  );
}
