"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import type { AdminUserDetail } from "@/lib/admin-users-shared";
import {
  ADMIN_USER_ACCESS_OPTIONS,
  formatAdminDate,
} from "@/lib/admin-users-shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function normalizedAccess(access: number): number {
  if (access === 100) return 100;
  if (access >= 2) return 2;
  if (access >= 1) return 1;
  return 0;
}

export type AdminUserSettingsHandle = {
  save: () => Promise<boolean>;
};

export const AdminUserSettingsForm = forwardRef<
  AdminUserSettingsHandle,
  {
    user: AdminUserDetail;
    disabled?: boolean;
    onDirtyChange?: (dirty: boolean) => void;
    onSaved?: (user: AdminUserDetail) => void;
  }
>(function AdminUserSettingsForm({ user, disabled, onDirtyChange, onSaved }, ref) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [access, setAccess] = useState(String(normalizedAccess(user.access)));
  const [mailingOptIn, setMailingOptIn] = useState(user.mailingOptIn);
  const [extraGenerations, setExtraGenerations] = useState(String(user.extraGenerations));
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => {
    return (
      name !== user.name ||
      email !== user.email ||
      firstName !== (user.firstName ?? "") ||
      lastName !== (user.lastName ?? "") ||
      Number(access) !== normalizedAccess(user.access) ||
      mailingOptIn !== user.mailingOptIn ||
      Number(extraGenerations) !== user.extraGenerations ||
      newPassword.trim() !== ""
    );
  }, [
    name,
    email,
    firstName,
    lastName,
    access,
    mailingOptIn,
    extraGenerations,
    newPassword,
    user,
  ]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const save = useCallback(async () => {
    if (!dirty) return true;
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name,
        email,
        firstName,
        lastName,
        access: Number(access),
        mailingOptIn,
        extraGenerations: Number(extraGenerations),
      };
      if (newPassword.trim()) body.newPassword = newPassword.trim();

      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        user?: AdminUserDetail;
        error?: string;
        field?: string;
        details?: { fieldErrors?: Record<string, string[]> };
      };
      if (!res.ok) {
        if (data.error === "NAME_TAKEN") {
          setError("That login name is already taken.");
          return false;
        }
        if (data.error === "EMAIL_TAKEN") {
          setError("That email is already taken.");
          return false;
        }
        const firstField = Object.values(data.details?.fieldErrors ?? {})[0]?.[0];
        setError(firstField ?? data.error ?? "Could not save");
        return false;
      }
      setNewPassword("");
      if (data.user) onSaved?.(data.user);
      return true;
    } catch (err) {
      console.error("[admin-user-settings]", err);
      setError("Network error. Try again.");
      return false;
    }
  }, [
    dirty,
    name,
    email,
    firstName,
    lastName,
    access,
    mailingOptIn,
    extraGenerations,
    newPassword,
    user.id,
    onSaved,
  ]);

  useImperativeHandle(ref, () => ({ save }), [save]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Id</Label>
          <Input value={String(user.id)} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Registered</Label>
          <Input value={formatAdminDate(user.createdAt)} disabled />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-user-name">Login name</Label>
          <Input
            id="admin-user-name"
            value={name}
            disabled={disabled}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-user-email">Email</Label>
          <Input
            id="admin-user-email"
            type="email"
            value={email}
            disabled={disabled}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-user-first">First name</Label>
          <Input
            id="admin-user-first"
            value={firstName}
            disabled={disabled}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-user-last">Last name</Label>
          <Input
            id="admin-user-last"
            value={lastName}
            disabled={disabled}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={access} onValueChange={setAccess} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADMIN_USER_ACCESS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-user-gens">Extra AI generations</Label>
          <Input
            id="admin-user-gens"
            type="number"
            min={0}
            step={1}
            value={extraGenerations}
            disabled={disabled}
            onChange={(e) => setExtraGenerations(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Google id</Label>
          <Input value={user.googleId ?? "—"} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Email verified</Label>
          <Input value={formatAdminDate(user.emailVerifiedAt)} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Author balance</Label>
          <Input value={user.balance.toFixed(2)} disabled />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-user-password">Set new password</Label>
          <Input
            id="admin-user-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            disabled={disabled}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Leave blank to keep current"
          />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox
            id="admin-user-mailing"
            checked={mailingOptIn}
            disabled={disabled}
            onCheckedChange={(v) => setMailingOptIn(v === true)}
          />
          <Label htmlFor="admin-user-mailing" className="font-normal">
            Mailing opt-in
          </Label>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
});
