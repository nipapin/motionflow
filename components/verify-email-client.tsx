"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, type AuthUser } from "@/components/auth-provider";

type VerifyJson =
  | { success: true; user: AuthUser }
  | { success: false; message?: string };

export function VerifyEmailClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const email = useMemo(
    () => (searchParams.get("email") ?? "").trim(),
    [searchParams],
  );
  const token = useMemo(
    () => (searchParams.get("token") ?? "").trim(),
    [searchParams],
  );

  const [status, setStatus] = useState<"working" | "ok" | "error">(
    !email || !token ? "error" : "working",
  );
  const [message, setMessage] = useState(
    !email || !token
      ? "This confirmation link is incomplete. Register again or request a new email from sign in."
      : "Confirming your email…",
  );

  useEffect(() => {
    if (!email || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, token }),
        });
        const data = (await res.json()) as VerifyJson;
        if (cancelled) return;
        if (data.success) {
          await refresh(data.user);
          router.refresh();
          setStatus("ok");
          setMessage("Email confirmed. You’re signed in.");
          setTimeout(() => router.push("/"), 1200);
          return;
        }
        setStatus("error");
        setMessage(data.message ?? "This confirmation link is invalid.");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Network error. Try the link again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email, token, refresh, router]);

  return (
    <div
      role={status === "error" ? "alert" : "status"}
      className={
        status === "error"
          ? "rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive max-w-md"
          : status === "ok"
            ? "rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 max-w-md"
            : "text-sm text-muted-foreground"
      }
    >
      <p>{message}</p>
      {status === "error" ? (
        <p className="mt-3">
          <Link href="/" className="underline underline-offset-2">
            Return home
          </Link>{" "}
          and open Sign in to resend the confirmation.
        </p>
      ) : null}
    </div>
  );
}
