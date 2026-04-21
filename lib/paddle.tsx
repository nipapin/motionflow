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

export function PaddleProvider({ children }: { children: ReactNode }) {
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const initialized = useRef(false);
  const listeners = useRef<Set<EventListener>>(new Set());

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    const environment = (process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? "sandbox") as Environments;

    if (!token) {
      console.warn("[Paddle] NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is not set; checkout will not load.");
      return;
    }

    initializePaddle({
      environment,
      token,
      eventCallback: (event) => {
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
        if (instance) setPaddle(instance);
      })
      .catch((err) => {
        console.error("[Paddle] Failed to initialize:", err);
      });
  }, []);

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
