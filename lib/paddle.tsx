"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  initializePaddle,
  type Environments,
  type Paddle,
  type PaddleEventData,
} from "@paddle/paddle-js";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";

type EventListener = (event: PaddleEventData) => void;

type PaddleContextValue = {
  paddle: Paddle | null;
  ready: boolean;
  subscribe: (listener: EventListener) => () => void;
};

const PaddleContext = createContext<PaddleContextValue>({
  paddle: null,
  ready: false,
  subscribe: () => () => {},
});

type PaddleProviderProps = {
  children: ReactNode;
  /** Override client token (e.g. Spunkram sandbox). Defaults to NEXT_PUBLIC_PADDLE_CLIENT_TOKEN. */
  token?: string;
  /** A null environment disables checkout when its configuration is unavailable. */
  environment: Environments | null;
  localSandboxPreview?: boolean;
  sandboxBuyerIds?: number[];
};

export function PaddleProvider({ children, token: tokenProp, environment: environmentProp, localSandboxPreview = false, sandboxBuyerIds }: PaddleProviderProps) {
  const { user } = useAuth();
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const initialized = useRef(false);
  const listeners = useRef<Set<EventListener>>(new Set());
  const sandboxBuyer = useRef<number | null>(null);
  useEffect(() => {
    const id = Number(user?.id);
    sandboxBuyer.current = sandboxBuyerIds?.includes(id) ? id : null;
  }, [sandboxBuyerIds, user?.id]);

  useEffect(() => {
    if (initialized.current) return;
    if (!environmentProp) return;
    initialized.current = true;
    const preview = localSandboxPreview && environmentProp === "sandbox";
    let previewActive = false;
    let previewCheckout: Paddle["Checkout"] | undefined;

    const token =
      tokenProp !== undefined
        ? tokenProp.trim()
        : process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    if (!token) {
      console.warn(
        "[Paddle] Client token is not set; checkout will not load.",
        tokenProp !== undefined
          ? "(NEXT_PUBLIC_SPUNKRAM_PADDLE_CLIENT_TOKEN or provider override)"
          : "(NEXT_PUBLIC_PADDLE_CLIENT_TOKEN)",
      );
      return;
    }

    initializePaddle({
      environment: environmentProp,
      token,
      eventCallback: (event) => {
        // Handle preview success without forwarding it to the account claim flow.
        if (previewActive && event.name === "checkout.completed") {
          toast.success("Test payment completed");
          previewCheckout?.close();
          return;
        }
        listeners.current.forEach((cb) => {
          try {
            cb(event);
          } catch (err) {
            console.error("[Paddle] event listener threw:", err);
          }
        });
      },
    })
      .then((instance) => {
        if (!instance) return;
        if (preview) {
          const checkout = instance.Checkout;
          previewCheckout = checkout;
          const open = checkout.open.bind(checkout);
          checkout.open = (options) => {
            if (options.transactionId && sandboxBuyer.current !== null) return open(options);
            if (!options.items?.length) throw new Error("Sandbox preview requires catalog items");
            previewActive = sandboxBuyer.current === null || Number(options.customData?.buyer_id) !== sandboxBuyer.current;
            if (!previewActive) return open(options);
            return open({
              items: options.items,
              settings: { ...options.settings, allowLogout: false },
              customer: { email: "spunkram-checkout-preview@example.com" },
              customData: { kind: "spunkram_local_preview" },
            });
          };
        }
        setPaddle(instance);
      })
      .catch((err) => {
        console.error("[Paddle] Failed to initialize:", err);
      });
  }, [tokenProp, environmentProp, localSandboxPreview]);

  const subscribe = useCallback((listener: EventListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo<PaddleContextValue>(
    () => ({ paddle, ready: paddle !== null, subscribe }),
    [paddle, subscribe],
  );

  return <PaddleContext.Provider value={value}>{children}</PaddleContext.Provider>;
}

export function usePaddle(): PaddleContextValue {
  return useContext(PaddleContext);
}
