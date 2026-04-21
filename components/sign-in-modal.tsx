"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useAuth, type AuthUser } from "@/components/auth-provider";

function authUserFromLoginPayload(u: { id: number; email: string; name: string }): AuthUser {
  return {
    ...u,
    oauthPasswordOnly: false,
    canChangePassword: true,
  };
}

type Mode = "signin" | "signup";

interface SignInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthSuccess?: () => void;
  /** When the dialog opens, start on this tab */
  initialMode?: Mode;
}

type AuthJson =
  | { success: true; user: { id: number; email: string; name: string } }
  | { success: false; message?: string; errors?: Record<string, string[] | undefined> };

export function SignInModal({
  open,
  onOpenChange,
  onAuthSuccess,
  initialMode = "signin",
}: SignInModalProps) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [agree, setAgree] = useState(false);
  const [mailing, setMailing] = useState(false);

  const resetMessages = () => {
    setFormError(null);
    setFieldErrors({});
  };

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      resetMessages();
    }
  }, [open, initialMode]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      resetMessages();
      setMode("signin");
    }
    onOpenChange(next);
  };

  const applyAuthErrors = (data: AuthJson) => {
    if (data.success) return;
    setFormError(data.message ?? "Something went wrong");
    const next: Record<string, string> = {};
    if (data.errors) {
      for (const [key, msgs] of Object.entries(data.errors)) {
        if (msgs?.[0]) next[key] = msgs[0];
      }
    }
    setFieldErrors(next);
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as AuthJson;
      if (data.success) {
        await refresh(authUserFromLoginPayload(data.user));
        router.refresh();
        onAuthSuccess?.();
        handleOpenChange(false);
      } else {
        applyAuthErrors(data);
      }
    } catch {
      setFormError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          name,
          password,
          password_confirmation: passwordConfirmation,
          agree,
          mailing,
        }),
      });
      const data = (await res.json()) as AuthJson;
      if (data.success) {
        await refresh(authUserFromLoginPayload(data.user));
        router.refresh();
        onAuthSuccess?.();
        handleOpenChange(false);
      } else {
        applyAuthErrors(data);
      }
    } catch {
      setFormError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    setFormError(null);
    window.location.href = "/api/auth/google";
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-blue-500/20 overflow-hidden p-0 max-h-[90vh] overflow-y-auto">
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/15 rounded-full blur-3xl" />
        </div>

        <div className="relative p-6">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-semibold text-foreground tracking-tight text-center">
              {mode === "signin" ? "Welcome back" : "Create an account"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-center">
              {mode === "signin"
                ? "Sign in to your account to continue"
                : "Register with email to get started"}
            </DialogDescription>
          </DialogHeader>

          {formError ? (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </div>
          ) : null}

          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-12 rounded-xl border-blue-500/30 bg-background/50 hover:bg-foreground/5 hover:border-blue-500/50 text-foreground font-medium mb-6 smooth"
          >
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </Button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-3 text-muted-foreground">or continue with email</span>
            </div>
          </div>

          {mode === "signin" ? (
            <form onSubmit={handleSignInSubmit} className="space-y-4">
              <div className="relative space-y-1">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    name="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={cn(
                      "pl-11 h-12 bg-background/50 border-blue-500/30 hover:border-blue-500/40 focus:border-blue-500/60 rounded-xl",
                      fieldErrors.email && "border-destructive",
                    )}
                    autoComplete="email"
                    required
                    disabled={loading}
                  />
                </div>
                {fieldErrors.email ? (
                  <p className="text-xs text-destructive px-1">{fieldErrors.email}</p>
                ) : null}
              </div>

              <div className="relative space-y-1">
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(
                      "pl-11 pr-11 h-12 bg-background/50 border-blue-500/30 rounded-xl",
                      fieldErrors.password && "border-destructive",
                    )}
                    autoComplete="current-password"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground smooth"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password ? (
                  <p className="text-xs text-destructive px-1">{fieldErrors.password}</p>
                ) : null}
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-blue-500 smooth"
                  onClick={() =>
                    setFormError("Password reset is not wired in this app yet. Use the main site.")
                  }
                >
                  Forgot password?
                </button>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl font-medium shadow-lg shadow-blue-500/25 smooth"
              >
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignUpSubmit} className="space-y-4">
              <div className="space-y-1">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    name="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={cn(
                      "pl-11 h-12 bg-background/50 border-blue-500/30 rounded-xl",
                      fieldErrors.email && "border-destructive",
                    )}
                    autoComplete="email"
                    required
                    disabled={loading}
                  />
                </div>
                {fieldErrors.email ? (
                  <p className="text-xs text-destructive px-1">{fieldErrors.email}</p>
                ) : null}
              </div>

              <div className="space-y-1">
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    name="name"
                    placeholder="Login name (public username)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={cn(
                      "pl-11 h-12 bg-background/50 border-blue-500/30 rounded-xl",
                      fieldErrors.name && "border-destructive",
                    )}
                    autoComplete="username"
                    maxLength={25}
                    required
                    disabled={loading}
                  />
                </div>
                {fieldErrors.name ? (
                  <p className="text-xs text-destructive px-1">{fieldErrors.name}</p>
                ) : (
                  <p className="text-xs text-muted-foreground px-1">
                    Letters, numbers, spaces, dashes, underscores, dots
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder="Password (min 8 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(
                      "pl-11 pr-11 h-12 bg-background/50 border-blue-500/30 rounded-xl",
                      fieldErrors.password && "border-destructive",
                    )}
                    autoComplete="new-password"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground smooth"
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
                    placeholder="Confirm password"
                    value={passwordConfirmation}
                    onChange={(e) => setPasswordConfirmation(e.target.value)}
                    className={cn(
                      "pl-11 h-12 bg-background/50 border-blue-500/30 rounded-xl",
                      fieldErrors.password_confirmation && "border-destructive",
                    )}
                    autoComplete="new-password"
                    required
                    disabled={loading}
                  />
                </div>
                {fieldErrors.password_confirmation ? (
                  <p className="text-xs text-destructive px-1">{fieldErrors.password_confirmation}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 pt-1">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="agree"
                    checked={agree}
                    onCheckedChange={(v) => setAgree(v === true)}
                    disabled={loading}
                    className="mt-0.5"
                  />
                  <Label htmlFor="agree" className="text-sm font-normal leading-snug cursor-pointer">
                    I agree to the terms of service and privacy policy
                  </Label>
                </div>
                {fieldErrors.agree ? (
                  <p className="text-xs text-destructive px-1">{fieldErrors.agree}</p>
                ) : null}

                <div className="flex items-start gap-2">
                  <Checkbox
                    id="mailing"
                    checked={mailing}
                    onCheckedChange={(v) => setMailing(v === true)}
                    disabled={loading}
                    className="mt-0.5"
                  />
                  <Label htmlFor="mailing" className="text-sm font-normal leading-snug cursor-pointer">
                    I want to subscribe to the newsletter
                  </Label>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl font-medium shadow-lg shadow-blue-500/25 smooth"
              >
                {loading ? "Creating account…" : "Register"}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  className="text-blue-500 hover:text-blue-400 font-medium smooth"
                  onClick={() => {
                    resetMessages();
                    setMode("signup");
                  }}
                >
                  Sign up for free
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-blue-500 hover:text-blue-400 font-medium smooth"
                  onClick={() => {
                    resetMessages();
                    setMode("signin");
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
