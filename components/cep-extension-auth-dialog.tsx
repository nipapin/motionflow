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
import { cn } from "@/lib/utils";

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
  "gal-cep": {
    title: "Sign in to Gal Toolkit MAX",
    description:
      "Gal Toolkit MAX in Premiere Pro / After Effects is asking to use your account.",
  },
  "motionflow-davinci": {
    title: "Sign in to the Motion Flow DaVinci script",
    description:
      "The Motion Flow script in DaVinci Resolve is asking to use your account.",
  },
};

/** Display `ABCD-1234` as `ABCD - 1234` (Motionflow confirm card). */
function formatCodeDisplay(code: string): string {
  return code.replace("-", " - ");
}

/**
 * CEP device-code gate on the author marketing site.
 * Visual match of the former /cep/login Card on Motionflow.
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
        title: "Sign in to Motion Flow",
        description:
          "An app is asking to use your Motionflow account.",
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
          status?: string;
        };
        if (r.ok) {
          if (action === "approve" && data.status === "device_limit") {
            setPhase("device_limit");
            return;
          }
          setPhase(action === "approve" ? "approved" : "denied");
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
      <DialogContent
        className={cn(
          "gap-0 overflow-hidden p-0 sm:max-w-md",
          // Match Motionflow /cep/login Card chrome (works on Spunkram tokens too).
          "rounded-xl border border-line bg-surface text-foreground shadow-lg",
        )}
      >
        <div className="flex flex-col gap-6 px-6 py-6">
          <DialogHeader className="gap-2 text-center sm:text-center">
            <DialogTitle className="text-xl font-semibold tracking-tight text-foreground">
              {branding.title}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {branding.description}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-6">
            <div className="rounded-lg border border-line bg-surface-2 px-6 py-3 font-mono text-2xl font-semibold tracking-widest text-foreground">
              {formatCodeDisplay(code)}
            </div>

            {busy ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                <span>Checking code…</span>
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
                text="Return to the extension — it will finish signing in automatically. You can close this."
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
                text="Return to the extension — it will ask which device to disconnect, then finish signing in."
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
                <Button
                  className="h-10 min-w-40 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => openSignIn("signin")}
                >
                  Sign in to continue
                </Button>
              </div>
            ) : (
              <div className="flex w-full flex-col items-center gap-5">
                {info?.device ? (
                  <div className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface-2/50 p-3 text-sm">
                    <MonitorSmartphone
                      className="size-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {info.device.user || "Unknown user"}
                      </div>
                      <div className="truncate text-muted-foreground">
                        {info.device.os || "Unknown OS"}
                      </div>
                    </div>
                  </div>
                ) : null}
                <p className="text-center text-sm text-muted-foreground">
                  Signed in as{" "}
                  <span className="font-medium text-foreground">{user.email}</span>.
                  Allow this device to use your account?
                </p>
                <div className="flex w-full gap-3">
                  <Button
                    className={cn(
                      "h-10 flex-1 font-semibold tracking-tight text-white",
                      "border border-white/10 bg-brand-violet-soft",
                      "shadow-[0_4px_24px_-6px_rgb(45_20_90/0.55),inset_0_1px_0_0_rgb(255_255_255/0.18)]",
                      "backdrop-blur-xl backdrop-saturate-150",
                      "transition-[background-image,box-shadow,border-color] duration-200",
                      "hover:bg-brand-violet-soft-hover hover:shadow-[0_6px_28px_-6px_rgb(55_25_110/0.55),inset_0_1px_0_0_rgb(255_255_255/0.22)]",
                      "light:border-black/10 light:shadow-[0_4px_24px_-6px_rgb(45_20_90/0.35),inset_0_1px_0_0_rgb(0_0_0/0.08)]",
                      "light:hover:shadow-[0_6px_28px_-6px_rgb(55_25_110/0.4),inset_0_1px_0_0_rgb(0_0_0/0.1)]",
                    )}
                    disabled={phase === "submitting"}
                    onClick={() => void submit("approve")}
                  >
                    {phase === "submitting" ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : null}
                    Allow
                  </Button>
                  <Button
                    className="h-10 flex-1 border-line bg-transparent hover:bg-surface-2"
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
      <div className="font-medium text-foreground">{title}</div>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
