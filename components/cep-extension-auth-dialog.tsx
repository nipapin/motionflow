"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  MonitorSmartphone,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CodeInfo = {
  code: string;
  status: "pending" | "complete" | "denied" | "expired";
  client?: string;
  device?: { mac?: string; user?: string; os?: string } | null;
};

type Phase =
  | "loading"
  | "invalid"
  | "ready"
  | "submitting"
  | "approved"
  | "denied"
  | "expired"
  | "device_limit"
  | "error";

const CLIENT_COPY: Record<string, { title: string; description: string }> = {
  "spunkram-cep": {
    title: "Sign in to the Spunkram extension",
    description:
      "The Spunkram extension in Premiere Pro / After Effects is asking to use your account.",
  },
};

/**
 * CEP device-code gate on the Spunkram marketing site.
 * Flow: open /spunkram?code=… → if no session, SignInModal → Allow / Deny.
 */
export function CepExtensionAuthDialog({
  initialCode,
  initialClient = "spunkram-cep",
}: {
  initialCode: string;
  initialClient?: string;
}) {
  const { user, loading: authLoading, openSignIn } = useAuth();
  const [info, setInfo] = useState<CodeInfo | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [open, setOpen] = useState(Boolean(initialCode.trim()));

  const code = initialCode.trim().toUpperCase();

  const branding = useMemo(() => {
    const client = info?.client || initialClient || "spunkram-cep";
    return (
      CLIENT_COPY[client] ?? {
        title: "Sign in to the Spunkram extension",
        description:
          "An Adobe extension is asking to use your Motionflow account.",
      }
    );
  }, [info?.client, initialClient]);

  useEffect(() => {
    if (!code) {
      setPhase("invalid");
      setOpen(false);
      return;
    }
    setOpen(true);
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/cep/auth/confirm?code=${encodeURIComponent(code)}`,
          { credentials: "include" },
        );
        if (cancelled) return;
        if (!r.ok) {
          setPhase("invalid");
          return;
        }
        const data = (await r.json()) as CodeInfo;
        setInfo(data);
        if (data.status === "expired") setPhase("expired");
        else if (data.status === "denied") setPhase("denied");
        else if (data.status === "complete") setPhase("approved");
        else setPhase("ready");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  // No browser session → open site login popup first; Allow/Deny follows after.
  useEffect(() => {
    if (!open || authLoading) return;
    if (phase !== "ready") return;
    if (user) return;
    openSignIn("signin");
  }, [open, authLoading, phase, user, openSignIn]);

  const submit = useCallback(
    async (action: "approve" | "deny") => {
      setPhase("submitting");
      try {
        const r = await fetch("/api/cep/auth/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code, action }),
        });
        const data = (await r.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (r.ok) {
          setPhase(action === "approve" ? "approved" : "denied");
          return;
        }
        if (data.error === "DEVICE_LIMIT") {
          setPhase("device_limit");
          return;
        }
        if (data.error === "CODE_EXPIRED") {
          setPhase("expired");
          return;
        }
        setErrorMessage(data.message ?? "Something went wrong. Try again.");
        setPhase("error");
      } catch {
        setErrorMessage("Network error. Please try again.");
        setPhase("error");
      }
    },
    [code],
  );

  if (!code) return null;

  const busy = phase === "loading" || authLoading;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle>{branding.title}</DialogTitle>
          <DialogDescription>{branding.description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5">
          <div className="rounded-lg border bg-muted px-6 py-3 font-mono text-2xl font-semibold tracking-widest">
            {code}
          </div>

          {busy ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span>Checking…</span>
            </div>
          ) : phase === "invalid" ? (
            <StatusBlock
              icon={<ShieldAlert className="size-8 text-destructive" />}
              title="Invalid link"
              text="This sign-in code is missing or malformed. Start again from the extension."
            />
          ) : phase === "expired" ? (
            <StatusBlock
              icon={<XCircle className="size-8 text-amber-500" />}
              title="Code expired"
              text="This code is no longer valid. Sign in again from the extension."
            />
          ) : phase === "approved" ? (
            <StatusBlock
              icon={<CheckCircle2 className="size-8 text-emerald-500" />}
              title="You're signed in"
              text="Return to the extension — it will finish automatically. You can close this."
            />
          ) : phase === "denied" ? (
            <StatusBlock
              icon={<XCircle className="size-8 text-muted-foreground" />}
              title="Request denied"
              text="The extension was not signed in. You can close this."
            />
          ) : phase === "device_limit" ? (
            <StatusBlock
              icon={<ShieldAlert className="size-8 text-amber-500" />}
              title="Device limit reached"
              text="Remove a device in the extension Account tab, then try again."
            />
          ) : phase === "error" ? (
            <StatusBlock
              icon={<ShieldAlert className="size-8 text-destructive" />}
              title="Something went wrong"
              text={errorMessage || "Please try again."}
            />
          ) : !user ? (
            <div className="flex flex-col items-center gap-4">
              <p className="text-center text-sm text-muted-foreground">
                Sign in to your Motionflow account to approve this request.
              </p>
              <Button onClick={() => openSignIn("signin")}>
                Sign in to continue
              </Button>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center gap-5">
              {info?.device ? (
                <div className="flex w-full items-center gap-3 rounded-lg border p-3 text-sm">
                  <MonitorSmartphone
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {info.device.user || "Unknown user"}
                    </div>
                    <div className="truncate text-muted-foreground">
                      {info.device.os || "Unknown OS"}
                    </div>
                  </div>
                </div>
              ) : null}
              <p className="text-center text-sm text-muted-foreground">
                Signed in as <span className="font-medium">{user.email}</span>.
                Allow this device to use your account?
              </p>
              <div className="flex w-full gap-3">
                <Button
                  className="flex-1"
                  disabled={phase === "submitting"}
                  onClick={() => void submit("approve")}
                >
                  {phase === "submitting" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  Allow
                </Button>
                <Button
                  className="flex-1"
                  variant="outline"
                  disabled={phase === "submitting"}
                  onClick={() => void submit("deny")}
                >
                  Deny
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusBlock({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {icon}
      <div className="font-medium">{title}</div>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
