"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const SPUNKRAM_AUTHOR_ID = 1691;
const PREMIERE_GAL_AUTHOR_ID = 4141;

type PackOption = {
  id: number;
  name: string;
  host: "PR" | "AE";
  price: number;
};

type AccessSnapshot = {
  user_id: number;
  email: string;
  name: string;
  exists: true;
  subscription_active: boolean;
  subscription_label: string | null;
  subscription_source: "admin" | "paddle" | "none";
  owned_pack_ids: number[];
  owned_packs: Array<{
    pack_id: number;
    name: string;
    host: string | null;
    source: "admin" | "paddle" | "unknown";
  }>;
};

type LookupHit = {
  id: number;
  email: string;
  name: string;
  subscription_active: boolean;
  subscription_label: string | null;
};

type GiveAccessDialogProps = {
  authorId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill for Manage access from a table row. */
  initialEmail?: string | null;
  onGranted: () => void;
};

export function ExtensionsGiveAccessDialog({
  authorId,
  open,
  onOpenChange,
  initialEmail,
  onGranted,
}: GiveAccessDialogProps) {
  const isSpunkram = authorId === SPUNKRAM_AUTHOR_ID;
  const isPremiereGal = authorId === PREMIERE_GAL_AUTHOR_ID;

  const [emailDraft, setEmailDraft] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [hits, setHits] = useState<LookupHit[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [access, setAccess] = useState<AccessSnapshot | null>(null);
  const [missingEmail, setMissingEmail] = useState<string | null>(null);
  const [accessBusy, setAccessBusy] = useState(false);

  const [packs, setPacks] = useState<PackOption[]>([]);
  const [packsBusy, setPacksBusy] = useState(false);

  const [spunkramTier, setSpunkramTier] = useState<"library" | "ai_toolkit">(
    "library",
  );
  const [spunkramDuration, setSpunkramDuration] = useState<
    "until_revoked" | "1_month" | "1_year"
  >("until_revoked");
  const [galPlan, setGalPlan] = useState<"lifetime" | "yearly" | "monthly">(
    "lifetime",
  );
  const [grantSubscription, setGrantSubscription] = useState(true);
  const [revokeSubscription, setRevokeSubscription] = useState(false);
  const [selectedPackIds, setSelectedPackIds] = useState<Set<number>>(
    new Set(),
  );
  const [revokePackIds, setRevokePackIds] = useState<Set<number>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setEmailDraft(initialEmail?.trim() ?? "");
    setSelectedEmail(initialEmail?.trim().toLowerCase() || null);
    setHits([]);
    setAccess(null);
    setMissingEmail(null);
    setSpunkramTier("library");
    setSpunkramDuration("until_revoked");
    setGalPlan("lifetime");
    setGrantSubscription(
      authorId === SPUNKRAM_AUTHOR_ID || authorId === PREMIERE_GAL_AUTHOR_ID,
    );
    setRevokeSubscription(false);
    setSelectedPackIds(new Set());
    setRevokePackIds(new Set());
    setFormError(null);
    setFormOk(null);
  }, [initialEmail, authorId]);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPacksBusy(true);
    void (async () => {
      try {
        const res = await fetch(`/api/packages/${authorId}/projects`);
        if (!res.ok) return;
        const data = (await res.json()) as { projects?: PackOption[] };
        if (!cancelled) {
          setPacks(data.projects || []);
        }
      } finally {
        if (!cancelled) setPacksBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, authorId]);

  const loadAccessForEmail = useCallback(
    async (email: string) => {
      setAccessBusy(true);
      setFormError(null);
      setAccess(null);
      setMissingEmail(null);
      try {
        const res = await fetch(
          `/api/extensions/${authorId}/users/lookup?email=${encodeURIComponent(email)}`,
        );
        const data = (await res.json()) as {
          access?: AccessSnapshot | { exists: false; email: string };
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Lookup failed");
        if (!data.access) throw new Error("Lookup failed");
        if (!data.access.exists) {
          setMissingEmail(data.access.email);
          setAccess(null);
          setGrantSubscription(isSpunkram || isPremiereGal);
          return;
        }
        setAccess(data.access);
        setMissingEmail(null);
        if (data.access.subscription_active) {
          setGrantSubscription(false);
          setRevokeSubscription(false);
        } else {
          setGrantSubscription(isSpunkram || isPremiereGal);
        }
        setSelectedPackIds(new Set());
        setRevokePackIds(new Set());
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "Lookup failed");
      } finally {
        setAccessBusy(false);
      }
    },
    [authorId, isSpunkram, isPremiereGal],
  );

  useEffect(() => {
    if (!open || !selectedEmail) return;
    void loadAccessForEmail(selectedEmail);
  }, [open, selectedEmail, loadAccessForEmail]);

  useEffect(() => {
    if (!open || selectedEmail) return;
    const q = emailDraft.trim();
    if (q.length < 3) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        setLookupBusy(true);
        try {
          const res = await fetch(
            `/api/extensions/${authorId}/users/lookup?q=${encodeURIComponent(q)}`,
          );
          const data = (await res.json()) as { users?: LookupHit[] };
          setHits(data.users || []);
        } catch {
          setHits([]);
        } finally {
          setLookupBusy(false);
        }
      })();
    }, 280);
    return () => window.clearTimeout(handle);
  }, [emailDraft, open, selectedEmail, authorId]);

  const ownedAdminPackIds = useMemo(() => {
    if (!access) return new Set<number>();
    return new Set(
      access.owned_packs
        .filter((p) => p.source === "admin")
        .map((p) => p.pack_id),
    );
  }, [access]);

  const paddleLockedSub =
    access?.subscription_active === true &&
    access.subscription_source === "paddle";

  const canSubmit = Boolean(
    selectedEmail &&
      (grantSubscription ||
        revokeSubscription ||
        selectedPackIds.size > 0 ||
        revokePackIds.size > 0) &&
      !submitting,
  );

  const togglePack = (id: number, checked: boolean) => {
    setSelectedPackIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleRevokePack = (id: number, checked: boolean) => {
    setRevokePackIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!selectedEmail) return;
    setSubmitting(true);
    setFormError(null);
    setFormOk(null);
    try {
      const body: Record<string, unknown> = {
        email: selectedEmail,
        createIfMissing: true,
        packIds: [...selectedPackIds],
        revokePackIds: [...revokePackIds],
      };
      if (revokeSubscription) {
        body.revokeSubscription = true;
      } else if (grantSubscription) {
        if (isSpunkram) {
          body.subscription = {
            tier: spunkramTier,
            duration: spunkramDuration,
          };
        } else if (isPremiereGal) {
          body.subscription = { plan: galPlan };
        }
      }

      const res = await fetch(`/api/extensions/${authorId}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        invited?: boolean;
        created?: boolean;
        access?: AccessSnapshot;
      };
      if (!res.ok) {
        throw new Error(data.message || data.error || "Grant failed");
      }
      const bits: string[] = [];
      if (data.created) bits.push("Account created");
      if (data.invited) bits.push("invite email sent");
      bits.push("Access updated");
      setFormOk(bits.join(" · "));
      if (data.access) setAccess(data.access);
      setMissingEmail(null);
      setSelectedPackIds(new Set());
      setRevokePackIds(new Set());
      setGrantSubscription(false);
      setRevokeSubscription(false);
      onGranted();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Grant failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/50 px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            {initialEmail ? "Manage access" : "Give access"}
          </DialogTitle>
          <DialogDescription>
            Grant a subscription or individual packs. New emails create an
            account and send a set-password invite.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="give-access-email">Email</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="give-access-email"
                value={emailDraft}
                disabled={Boolean(initialEmail)}
                onChange={(e) => {
                  setEmailDraft(e.target.value);
                  setSelectedEmail(null);
                  setAccess(null);
                  setMissingEmail(null);
                  setFormOk(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const email = emailDraft.trim().toLowerCase();
                    if (email.includes("@")) {
                      setSelectedEmail(email);
                      setHits([]);
                    }
                  }
                }}
                placeholder="Search name or email…"
                className="pl-9"
                autoComplete="off"
              />
              {lookupBusy ? (
                <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            {!selectedEmail && hits.length > 0 ? (
              <ul className="overflow-hidden rounded-lg border border-border/50">
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-foreground/5"
                      onClick={() => {
                        setSelectedEmail(hit.email.toLowerCase());
                        setEmailDraft(hit.email);
                        setHits([]);
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {hit.name || hit.email}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {hit.email}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {hit.subscription_label || "No sub"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {!selectedEmail &&
            emailDraft.trim().includes("@") &&
            emailDraft.trim().length >= 3 ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => {
                  const email = emailDraft.trim().toLowerCase();
                  setSelectedEmail(email);
                  setHits([]);
                }}
              >
                Use {emailDraft.trim().toLowerCase()}
              </Button>
            ) : null}
          </div>

          {accessBusy ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading access…
            </div>
          ) : null}

          {missingEmail ? (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-3 text-sm">
              <p className="font-medium text-foreground">New account</p>
              <p className="mt-1 text-muted-foreground">
                No user with <span className="font-mono">{missingEmail}</span>.
                We will create the account and email a link to set a password
                (valid 7 days).
              </p>
            </div>
          ) : null}

          {access ? (
            <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-3 text-sm">
              <p className="font-medium text-foreground">
                {access.name || access.email}
              </p>
              <p className="text-xs text-muted-foreground">{access.email}</p>
              <p className="mt-2 text-[13px] text-muted-foreground">
                Subscription:{" "}
                <span className="text-foreground">
                  {access.subscription_label || "None"}
                </span>
                {access.subscription_source === "paddle"
                  ? " · Paid via Paddle"
                  : access.subscription_source === "admin"
                    ? " · Admin grant"
                    : null}
              </p>
              {access.owned_packs.length > 0 ? (
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Owned packs:{" "}
                  {access.owned_packs.map((p) => p.name).join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}

          {(selectedEmail || missingEmail) && !accessBusy ? (
            <>
              {(isSpunkram || isPremiereGal) && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="grant-sub"
                      checked={grantSubscription}
                      disabled={paddleLockedSub || revokeSubscription}
                      onCheckedChange={(v) => {
                        setGrantSubscription(v === true);
                        if (v === true) setRevokeSubscription(false);
                      }}
                    />
                    <Label htmlFor="grant-sub" className="font-medium">
                      Grant subscription
                    </Label>
                  </div>
                  {paddleLockedSub ? (
                    <p className="text-[13px] text-muted-foreground">
                      Active Paddle subscription — cannot replace from admin.
                      Manage billing in Paddle if needed.
                    </p>
                  ) : null}
                  {grantSubscription && !paddleLockedSub ? (
                    <div className="space-y-3 rounded-lg border border-border/40 p-3">
                      {isSpunkram ? (
                        <>
                          <div className="space-y-1.5">
                            <Label>Plan</Label>
                            <div className="flex flex-wrap gap-2">
                              {(
                                [
                                  ["library", "Editor"],
                                  ["ai_toolkit", "Editor AI"],
                                ] as const
                              ).map(([value, label]) => (
                                <button
                                  key={value}
                                  type="button"
                                  className={cn(
                                    "rounded-md border px-3 py-1.5 text-sm",
                                    spunkramTier === value
                                      ? "border-blue-500/50 bg-blue-500/15 text-foreground"
                                      : "border-border/50 text-muted-foreground hover:bg-foreground/5",
                                  )}
                                  onClick={() => setSpunkramTier(value)}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Duration</Label>
                            <div className="flex flex-wrap gap-2">
                              {(
                                [
                                  ["until_revoked", "Until revoked"],
                                  ["1_month", "1 month"],
                                  ["1_year", "1 year"],
                                ] as const
                              ).map(([value, label]) => (
                                <button
                                  key={value}
                                  type="button"
                                  className={cn(
                                    "rounded-md border px-3 py-1.5 text-sm",
                                    spunkramDuration === value
                                      ? "border-blue-500/50 bg-blue-500/15 text-foreground"
                                      : "border-border/50 text-muted-foreground hover:bg-foreground/5",
                                  )}
                                  onClick={() => setSpunkramDuration(value)}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-1.5">
                          <Label>Plan</Label>
                          <div className="flex flex-wrap gap-2">
                            {(
                              [
                                ["lifetime", "Lifetime"],
                                ["yearly", "Yearly"],
                                ["monthly", "Monthly"],
                              ] as const
                            ).map(([value, label]) => (
                              <button
                                key={value}
                                type="button"
                                className={cn(
                                  "rounded-md border px-3 py-1.5 text-sm",
                                  galPlan === value
                                    ? "border-blue-500/50 bg-blue-500/15 text-foreground"
                                    : "border-border/50 text-muted-foreground hover:bg-foreground/5",
                                )}
                                onClick={() => setGalPlan(value)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {access?.subscription_source === "admin" &&
                  access.subscription_active ? (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="revoke-sub"
                        checked={revokeSubscription}
                        onCheckedChange={(v) => {
                          setRevokeSubscription(v === true);
                          if (v === true) setGrantSubscription(false);
                        }}
                      />
                      <Label htmlFor="revoke-sub" className="text-sm">
                        Revoke admin subscription
                      </Label>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="space-y-2">
                <Label>Packs</Label>
                <p className="text-[13px] text-muted-foreground">
                  A subscription already unlocks all packs. Grant individual
                  packs only when you want partial access.
                </p>
                {packsBusy ? (
                  <p className="text-sm text-muted-foreground">Loading packs…</p>
                ) : packs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No packs yet.</p>
                ) : (
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/50 p-2">
                    {packs.map((p) => {
                      const owned = access?.owned_pack_ids.includes(p.id);
                      const adminOwned = ownedAdminPackIds.has(p.id);
                      return (
                        <li
                          key={p.id}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-foreground/5"
                        >
                          <Checkbox
                            id={`pack-${p.id}`}
                            checked={selectedPackIds.has(p.id)}
                            disabled={owned === true}
                            onCheckedChange={(v) =>
                              togglePack(p.id, v === true)
                            }
                          />
                          <label
                            htmlFor={`pack-${p.id}`}
                            className="min-w-0 flex-1 cursor-pointer text-sm"
                          >
                            <span className="font-medium">{p.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {p.host}
                              {owned
                                ? ownedAdminPackIds.has(p.id)
                                  ? " · admin"
                                  : " · owned"
                                : null}
                            </span>
                          </label>
                          {adminOwned ? (
                            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <Checkbox
                                checked={revokePackIds.has(p.id)}
                                onCheckedChange={(v) =>
                                  toggleRevokePack(p.id, v === true)
                                }
                              />
                              Revoke
                            </label>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : null}

          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          {formOk ? (
            <p className="text-sm text-emerald-500" role="status">
              {formOk}
            </p>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t border-border/50 px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {missingEmail ? "Create & give access" : "Save access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
