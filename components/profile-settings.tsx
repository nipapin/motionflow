"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type AuthUserPayload = {
  id: number;
  email: string;
  name: string;
  oauthPasswordOnly: boolean;
  hasGoogleLinked?: boolean;
  canChangePassword: boolean;
  canUnlinkGoogle?: boolean;
};

type PatchJson =
  | {
      success: true;
      user: AuthUserPayload;
    }
  | {
      success: false;
      message?: string;
      errors?: Record<string, string[] | undefined>;
    };

function firstError(errors: Record<string, string[] | undefined> | undefined): string | null {
  if (!errors) return null;
  for (const msgs of Object.values(errors)) {
    if (msgs?.[0]) return msgs[0];
  }
  return null;
}

export function ProfileSettings() {
  const { user, loading, refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [unlinkingGoogle, setUnlinkingGoogle] = useState(false);
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
  }, [user]);

  if (loading || !user) {
    return (
      <div className="rounded-xl border border-blue-500/30 bg-card/30 p-8 text-sm text-muted-foreground glow">
        Loading profile…
      </div>
    );
  }

  const hasGoogleLinked = user.hasGoogleLinked === true;
  const canChangePassword = user.canChangePassword === true;
  const showUnlinkGoogle = hasGoogleLinked;

  const patch = async (body: Record<string, unknown>, onSuccess: () => void) => {
    const r = await fetch("/api/auth/profile", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await r.json()) as PatchJson;
    if (!data.success) {
      toast.error(firstError(data.errors) ?? data.message ?? "Update failed");
      return false;
    }
    await refresh();
    onSuccess();
    toast.success("Saved");
    return true;
  };

  const onSaveName = async () => {
    if (name.trim() === user.name) {
      toast.message("No changes to save");
      return;
    }
    setSavingName(true);
    try {
      await patch({ name: name.trim() }, () => {});
    } finally {
      setSavingName(false);
    }
  };

  const onSaveEmail = async () => {
    if (email.trim().toLowerCase() === user.email.toLowerCase()) {
      toast.message("No changes to save");
      return;
    }
    if (!emailPassword) {
      toast.error("Enter your current password to change email");
      return;
    }
    setSavingEmail(true);
    try {
      const ok = await patch(
        { email: email.trim().toLowerCase(), currentPassword: emailPassword },
        () => setEmailPassword(""),
      );
      if (ok) setEmailPassword("");
    } finally {
      setSavingEmail(false);
    }
  };

  const onUnlinkGoogle = async () => {
    setUnlinkingGoogle(true);
    try {
      const r = await fetch("/api/auth/profile/unlink-google", {
        method: "POST",
        credentials: "include",
      });
      const data = (await r.json()) as PatchJson;
      if (!data.success) {
        toast.error(firstError(data.errors) ?? data.message ?? "Could not unlink Google");
        return;
      }
      await refresh();
      setUnlinkDialogOpen(false);
      toast.success("Google account unlinked");
    } finally {
      setUnlinkingGoogle(false);
    }
  };

  const onSavePassword = async () => {
    setSavingPassword(true);
    try {
      const ok = await patch(
        {
          currentPassword,
          newPassword,
          newPassword_confirmation: confirmPassword,
        },
        () => {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        },
      );
      if (ok) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update how you appear on Motion Flow and manage sign-in details.
        </p>
      </div>

      <Card className="border-blue-500/30 bg-card/40 backdrop-blur-sm glow">
        <CardHeader>
          <CardTitle>Display name</CardTitle>
          <CardDescription>
            This is your public login name (same rules as when you registered).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="username"
              className="max-w-md bg-foreground/5 border-transparent"
            />
          </div>
          <Button
            type="button"
            onClick={() => void onSaveName()}
            disabled={savingName || name.trim() === user.name}
            className="rounded-full bg-gradient-to-r from-blue-600 to-blue-500"
          >
            {savingName ? "Saving…" : "Save name"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-blue-500/30 bg-card/40 backdrop-blur-sm glow">
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>
            {hasGoogleLinked
              ? "This account uses Google sign-in. The email is tied to your Google account."
              : "Change the address you use to sign in with a password."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={hasGoogleLinked}
              autoComplete="email"
              className="max-w-md bg-foreground/5 border-transparent disabled:opacity-70"
            />
          </div>
          {!hasGoogleLinked && (
            <>
              <div className="space-y-2">
                <Label htmlFor="profile-email-pw">Current password</Label>
                <Input
                  id="profile-email-pw"
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  autoComplete="current-password"
                  className="max-w-md bg-foreground/5 border-transparent"
                />
              </div>
              <Button
                type="button"
                onClick={() => void onSaveEmail()}
                disabled={
                  savingEmail || email.trim().toLowerCase() === user.email.toLowerCase()
                }
                variant="secondary"
                className="rounded-full"
              >
                {savingEmail ? "Saving…" : "Save email"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {showUnlinkGoogle && (
        <Card className="border-blue-500/30 bg-card/40 backdrop-blur-sm glow">
          <CardHeader>
            <CardTitle>Google account</CardTitle>
            <CardDescription>
              Your profile is linked to Google. Unlink to sign in with email and password only, or
              keep both methods.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-w-md">
            <AlertDialog open={unlinkDialogOpen} onOpenChange={setUnlinkDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  Unlink Google account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="border-blue-500/30 bg-card">
                <AlertDialogHeader>
                  <AlertDialogTitle>Unlink Google account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You will no longer be able to sign in with Google on this account. You can still
                    use your email and password.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={unlinkingGoogle}>Cancel</AlertDialogCancel>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={unlinkingGoogle}
                    onClick={() => void onUnlinkGoogle()}
                  >
                    {unlinkingGoogle ? "Unlinking…" : "Unlink"}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

      {canChangePassword && (
        <Card className="border-blue-500/30 bg-card/40 backdrop-blur-sm glow">
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Only for accounts that sign in with email and password.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="profile-cur-pw">Current password</Label>
              <Input
                id="profile-cur-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className="bg-foreground/5 border-transparent"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-new-pw">New password</Label>
              <Input
                id="profile-new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="bg-foreground/5 border-transparent"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-confirm-pw">Confirm new password</Label>
              <Input
                id="profile-confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="bg-foreground/5 border-transparent"
              />
            </div>
            <Button
              type="button"
              onClick={() => void onSavePassword()}
              disabled={
                savingPassword ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword ||
                newPassword.length < 8
              }
              variant="secondary"
              className="rounded-full"
            >
              {savingPassword ? "Updating…" : "Update password"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
