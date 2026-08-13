"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ResetJson =
  | { success: true; message?: string }
  | {
      success: false;
      message?: string;
      errors?: Record<string, string[] | undefined>;
    };

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = useMemo(
    () => (searchParams.get("email") ?? "").trim(),
    [searchParams],
  );
  const token = useMemo(
    () => (searchParams.get("token") ?? "").trim(),
    [searchParams],
  );

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const missingLink = !token || !initialEmail;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setFieldErrors({});
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          token,
          password,
          password_confirmation: passwordConfirmation,
        }),
      });
      const data = (await res.json()) as ResetJson;
      if (data.success) {
        setFormSuccess(data.message ?? "Your password has been reset.");
        setTimeout(() => router.push("/"), 1500);
        return;
      }
      setFormError(data.message ?? "Something went wrong");
      const next: Record<string, string> = {};
      if (data.errors) {
        for (const [key, msgs] of Object.entries(data.errors)) {
          if (msgs?.[0]) next[key] = msgs[0];
        }
      }
      setFieldErrors(next);
    } catch {
      setFormError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (missingLink) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        This reset link is incomplete. Request a new one from the sign-in
        dialog, or{" "}
        <Link href="/" className="underline underline-offset-2">
          return home
        </Link>
        .
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      {formError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </div>
      ) : null}
      {formSuccess ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400"
        >
          {formSuccess}
        </div>
      ) : null}

      <div className="space-y-1">
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(
              "pl-11 h-12 bg-background/50 border-blue-500/30 rounded-xl",
              fieldErrors.email && "border-destructive",
            )}
            autoComplete="email"
            required
            disabled={loading || Boolean(formSuccess)}
            readOnly={Boolean(initialEmail)}
          />
        </div>
        {fieldErrors.email ? (
          <p className="text-xs text-destructive px-1">{fieldErrors.email}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type={showPassword ? "text" : "password"}
            name="password"
            placeholder="New password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn(
              "pl-11 pr-11 h-12 bg-background/50 border-blue-500/30 rounded-xl",
              fieldErrors.password && "border-destructive",
            )}
            autoComplete="new-password"
            required
            disabled={loading || Boolean(formSuccess)}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {fieldErrors.password ? (
          <p className="text-xs text-destructive px-1">{fieldErrors.password}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type={showPassword ? "text" : "password"}
            name="password_confirmation"
            placeholder="Confirm new password"
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
            className={cn(
              "pl-11 h-12 bg-background/50 border-blue-500/30 rounded-xl",
              fieldErrors.password_confirmation && "border-destructive",
            )}
            autoComplete="new-password"
            required
            disabled={loading || Boolean(formSuccess)}
          />
        </div>
        {fieldErrors.password_confirmation ? (
          <p className="text-xs text-destructive px-1">
            {fieldErrors.password_confirmation}
          </p>
        ) : null}
        {fieldErrors.token ? (
          <p className="text-xs text-destructive px-1">{fieldErrors.token}</p>
        ) : null}
      </div>

      <Button
        type="submit"
        disabled={loading || Boolean(formSuccess)}
        className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl font-medium shadow-lg shadow-blue-500/25"
      >
        {loading ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
