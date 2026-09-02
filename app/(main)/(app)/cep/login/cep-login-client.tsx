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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

export function CepLoginClient({
  initialCode,
  initialClient = "spunkram-cep",
}: {
  initialCode: string;
  initialClient?: string;
}) {
  const { user, loading: authLoading, openSignIn } = useAuth();
  const [info, setInfo] = useState<CodeInfo | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const code = initialCode.trim().toUpperCase();

  const branding = useMemo(() => {
    const client = info?.client || initialClient || "spunkram-cep";
    return (
      CLIENT_COPY[client] ?? {
        title: "Sign in to Motion Flow",
        description: "An app is asking to use your Motionflow account.",
      }
    );
  }, [info?.client, initialClient]);

  useEffect(() => {
    if (!code) {
      setPhase("invalid");
      return;
    }
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

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{branding.title}</CardTitle>
          <CardDescription>{branding.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          {code ? (
            <div className="rounded-lg border bg-muted px-6 py-3 font-mono text-2xl font-semibold tracking-widest">
              {code}
            </div>
          ) : null}

          {phase === "loading" || authLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span>Checking code…</span>
            </div>
          ) : phase === "invalid" ? (
            <StatusBlock
              icon={<ShieldAlert className="size-8 text-destructive" />}
              title="Invalid link"
              text="This sign-in code is missing or malformed. Start the sign-in again from the app."
            />
          ) : phase === "expired" ? (
            <StatusBlock
              icon={<XCircle className="size-8 text-amber-500" />}
              title="Code expired"
              text="This code is no longer valid. Start sign-in again from the app to get a new code."
            />
          ) : phase === "approved" ? (
            <StatusBlock
              icon={<CheckCircle2 className="size-8 text-emerald-500" />}
              title="You're signed in"
              text="Return to the app — it will finish signing in automatically. You can close this tab."
            />
          ) : phase === "denied" ? (
            <StatusBlock
              icon={<XCircle className="size-8 text-muted-foreground" />}
              title="Request denied"
              text="The app was not signed in. You can close this tab."
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
                  onClick={() => submit("approve")}
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
                  onClick={() => submit("deny")}
                >
                  Deny
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
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
