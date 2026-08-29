"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Puzzle,
  RefreshCw,
  Search,
  ShieldOff,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPackagesAuthorPublicById } from "@/lib/packages-admin-client";
import { cn } from "@/lib/utils";

type PackChip = {
  pack_id: number;
  name: string;
  host: string | null;
  catalog_version?: string | null;
  installed_version?: string | null;
};

type RecentError = {
  id: number;
  action: string;
  error: string;
  error_code: string | null;
  severity: string;
  occurred_at: string;
};

type ExtensionDevice = {
  device_id: string;
  device_name: string | null;
  ip: string | null;
  user_fingerprint: string | null;
  client: string;
  created_at: string;
  last_seen_at: string | null;
  online?: boolean;
  host_app_id: string | null;
  host_app_name: string | null;
  host_version: string | null;
  os: string | null;
  extension_version: string | null;
  packs: PackChip[];
  error_count: number;
  recent_errors: RecentError[];
};

type ExtensionUserGroup = {
  user_id: number;
  email: string;
  name: string;
  last_seen_at: string | null;
  device_count: number;
  online_count?: number;
  devices: ExtensionDevice[];
};

type ListResponse = {
  client?: string;
  extension_name?: string;
  users: ExtensionUserGroup[];
  page: number;
  page_size: number;
  total: number;
  device_total?: number;
  error?: string;
  message?: string;
};

type RevokeTarget = {
  email: string;
  device: ExtensionDevice;
};

type PacksResponse = {
  user_id: number;
  email: string;
  name: string;
  subscription_active: boolean;
  purchased: Array<{
    pack_id: number;
    name: string;
    host: string | null;
    catalog_version: string | null;
    access: "purchase" | "subscription" | "free";
  }>;
  installed: Array<{
    pack_id: number;
    name: string;
    host: string | null;
    catalog_version: string | null;
    installed_version: string | null;
    devices: Array<{
      device_id: string;
      device_name: string | null;
      installed_version: string | null;
    }>;
  }>;
  active: Array<{
    pack_id: number;
    name: string;
    host: string | null;
    catalog_version: string | null;
    devices: Array<{
      device_id: string;
      device_name: string | null;
    }>;
  }>;
  error?: string;
  message?: string;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fingerprintHint(raw: string | null): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as {
      os?: string;
      user?: string;
      mac?: string;
    };
    const parts = [parsed.os, parsed.user].filter(Boolean);
    return parts.join(" · ");
  } catch {
    return raw.slice(0, 48);
  }
}

function hostLabel(device: ExtensionDevice): string {
  return [device.host_app_name || device.host_app_id, device.host_version]
    .filter(Boolean)
    .join(" ");
}

function uniquePackCount(devices: ExtensionDevice[]): number {
  const ids = new Set<number>();
  for (const d of devices) {
    for (const p of d.packs) ids.add(p.pack_id);
  }
  return ids.size;
}

function totalErrors(devices: ExtensionDevice[]): number {
  return devices.reduce((sum, d) => sum + d.error_count, 0);
}

function accessLabel(access: "purchase" | "subscription" | "free"): string {
  if (access === "purchase") return "Purchased";
  if (access === "subscription") return "Subscription";
  return "Free";
}

function PackRowMeta({
  host,
  catalogVersion,
  installedVersion,
}: {
  host: string | null;
  catalogVersion?: string | null;
  installedVersion?: string | null;
}) {
  const bits = [
    host,
    catalogVersion ? `catalog ${catalogVersion}` : null,
    installedVersion ? `installed ${installedVersion}` : null,
  ].filter(Boolean);
  if (bits.length === 0) return null;
  return (
    <p className="mt-0.5 text-[11px] text-muted-foreground">{bits.join(" · ")}</p>
  );
}

export function ExtensionsUsersList({ authorId }: { authorId: number }) {
  const author = getPackagesAuthorPublicById(authorId);
  const [groups, setGroups] = useState<ExtensionUserGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noClient, setNoClient] = useState(false);
  const [extensionName, setExtensionName] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deviceTotal, setDeviceTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [devicesUser, setDevicesUser] = useState<ExtensionUserGroup | null>(
    null,
  );
  const [packsUser, setPacksUser] = useState<ExtensionUserGroup | null>(null);
  const [packsData, setPacksData] = useState<PacksResponse | null>(null);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packsError, setPacksError] = useState<string | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("page", String(page));
      const res = await fetch(
        `/api/extensions/${authorId}/users?${params.toString()}`,
      );
      const data = (await res.json()) as ListResponse;
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to load");
      }
      if (data.error === "NO_CEP_CLIENT") {
        setNoClient(true);
        setGroups([]);
        setTotal(0);
        setDeviceTotal(0);
        setExtensionName(null);
        return;
      }
      setNoClient(false);
      setGroups(data.users || []);
      setTotal(data.total ?? 0);
      setDeviceTotal(data.device_total ?? 0);
      setPageSize(data.page_size ?? 50);
      setExtensionName(data.extension_name ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [authorId, page, q]);

  useEffect(() => {
    void load();
  }, [load]);

  // Soft-refresh presence while the page is open
  useEffect(() => {
    if (noClient) return;
    const id = setInterval(() => {
      void load();
    }, 30_000);
    return () => clearInterval(id);
  }, [load, noClient]);

  const openDevicesUser = useMemo(() => {
    if (!devicesUser) return null;
    return groups.find((g) => g.user_id === devicesUser.user_id) ?? null;
  }, [devicesUser, groups]);

  useEffect(() => {
    if (devicesUser && !openDevicesUser) {
      setDevicesUser(null);
      setExpandedErrors(new Set());
    }
  }, [devicesUser, openDevicesUser]);

  const loadPacks = useCallback(
    async (userId: number) => {
      setPacksLoading(true);
      setPacksError(null);
      setPacksData(null);
      try {
        const res = await fetch(
          `/api/extensions/${authorId}/users/${userId}/packs`,
        );
        const data = (await res.json()) as PacksResponse;
        if (!res.ok) {
          throw new Error(data.message || data.error || "Failed to load packs");
        }
        setPacksData(data);
      } catch (e) {
        setPacksError(e instanceof Error ? e.message : "Failed to load packs");
      } finally {
        setPacksLoading(false);
      }
    },
    [authorId],
  );

  const openPacksModal = (group: ExtensionUserGroup) => {
    setPacksUser(group);
    void loadPacks(group.user_id);
  };

  const closePacksModal = () => {
    setPacksUser(null);
    setPacksData(null);
    setPacksError(null);
  };

  const toggleErrors = (deviceId: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/extensions/${authorId}/devices/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: revokeTarget.device.device_id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Revoke failed");
      }
      setRevokeTarget(null);
      await load();
      if (packsUser) {
        void loadPacks(packsUser.user_id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
      setRevokeTarget(null);
    } finally {
      setRevoking(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const packsModalUser = packsUser
    ? (groups.find((g) => g.user_id === packsUser.user_id) ?? packsUser)
    : null;

  return (
    <div className="w-full space-y-8">
      <header className="space-y-4">
        <Link
          href="/profile/extensions"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All authors
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[13px] text-muted-foreground">Extensions Users</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {author?.label ?? `Author ${authorId}`}
            </h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              {extensionName
                ? `Users signed into ${extensionName}. Open Devices or Packs for details.`
                : "Users with active CEP devices for this author."}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <form
          className="relative flex min-w-60 max-w-sm flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQ(qDraft.trim());
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Search email or name…"
            className="pl-9"
          />
        </form>
        {q ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQDraft("");
              setQ("");
              setPage(1);
            }}
          >
            Clear
          </Button>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {total} user{total === 1 ? "" : "s"}
          {deviceTotal > 0
            ? ` · ${deviceTotal} device${deviceTotal === 1 ? "" : "s"} on this page`
            : null}
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      {noClient ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 px-6 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Puzzle className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">
            No CEP extension for this author
          </p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Register a client in the server CEP registry to track users here.
          </p>
        </div>
      ) : loading && groups.length === 0 ? (
        <div className="space-y-2 rounded-xl border border-border/50 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 px-6 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Puzzle className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No active users</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Users who sign in to the extension will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-55">User</TableHead>
                <TableHead className="w-28">Devices</TableHead>
                <TableHead className="w-28">Packs</TableHead>
                <TableHead className="w-28">Errors</TableHead>
                <TableHead className="w-40">Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => {
                const packCount = uniquePackCount(group.devices);
                const errors = totalErrors(group.devices);
                return (
                  <TableRow key={group.user_id}>
                    <TableCell>
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate text-sm font-medium text-foreground">
                          {group.name || "—"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {group.email}
                        </p>
                        <p className="text-[11px] text-muted-foreground/80">
                          user_{group.user_id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                        onClick={() => {
                          setExpandedErrors(new Set());
                          setDevicesUser(group);
                        }}
                      >
                        {group.device_count}
                        <span className="text-xs font-normal text-muted-foreground">
                          {group.device_count === 1 ? "device" : "devices"}
                        </span>
                        {(group.online_count ?? 0) > 0 ? (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                            {group.online_count} online
                          </span>
                        ) : (
                          <span className="rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            offline
                          </span>
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                        onClick={() => openPacksModal(group)}
                      >
                        {packCount}
                        <span className="text-xs font-normal text-muted-foreground">
                          installed
                        </span>
                      </button>
                    </TableCell>
                    <TableCell>
                      {errors === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          None
                        </span>
                      ) : (
                        <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                          {errors}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatWhen(group.last_seen_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}

      {/* Devices modal */}
      <Dialog
        open={!!openDevicesUser}
        onOpenChange={(open) => {
          if (!open) {
            setDevicesUser(null);
            setExpandedErrors(new Set());
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          {openDevicesUser ? (
            <>
              <DialogHeader className="shrink-0 border-b border-border/50 px-6 py-4">
                <DialogTitle>
                  Devices — {openDevicesUser.name || openDevicesUser.email}
                </DialogTitle>
                <DialogDescription>
                  {openDevicesUser.email} · user_{openDevicesUser.user_id} ·{" "}
                  {openDevicesUser.device_count} active{" "}
                  {openDevicesUser.device_count === 1 ? "device" : "devices"}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <ul className="space-y-3">
                  {openDevicesUser.devices.map((device) => {
                    const host = hostLabel(device);
                    const fp = fingerprintHint(device.user_fingerprint);
                    const isOpen = expandedErrors.has(device.device_id);
                    return (
                      <li
                        key={device.device_id}
                        className="rounded-xl border border-border/50 bg-card/40 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-sm font-medium text-foreground">
                              {device.device_name || device.device_id}
                              <span
                                className={cn(
                                  "ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium",
                                  device.online
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : "bg-foreground/5 text-muted-foreground",
                                )}
                              >
                                {device.online ? "Online" : "Offline"}
                              </span>
                            </p>
                            {host ? (
                              <p className="text-xs text-muted-foreground">
                                {host}
                                {device.extension_version
                                  ? ` · ext ${device.extension_version}`
                                  : ""}
                              </p>
                            ) : null}
                            {(device.os || fp) && (
                              <p className="text-[11px] text-muted-foreground/80">
                                {device.os || fp}
                              </p>
                            )}
                            <p className="text-[11px] text-muted-foreground/70">
                              {[
                                device.ip,
                                `seen ${formatWhen(device.last_seen_at)}`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            {device.error_count > 0 ? (
                              <div className="pt-1">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-500 dark:text-amber-400"
                                  onClick={() => toggleErrors(device.device_id)}
                                  aria-expanded={isOpen}
                                >
                                  {device.error_count} error
                                  {device.error_count === 1 ? "" : "s"}
                                  <ChevronDown
                                    className={cn(
                                      "h-3.5 w-3.5 transition",
                                      isOpen && "rotate-180",
                                    )}
                                  />
                                </button>
                                {isOpen ? (
                                  <ul className="mt-2 space-y-2">
                                    {device.recent_errors.map((err) => (
                                      <li
                                        key={err.id}
                                        className="rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-xs"
                                      >
                                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                                          <span className="font-medium text-foreground">
                                            {err.action}
                                            {err.error_code ? (
                                              <span className="ml-2 font-mono text-muted-foreground">
                                                {err.error_code}
                                              </span>
                                            ) : null}
                                          </span>
                                          <span className="text-muted-foreground">
                                            {formatWhen(err.occurred_at)}
                                          </span>
                                        </div>
                                        <p className="mt-1 wrap-break-word text-muted-foreground">
                                          {err.error}
                                        </p>
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() =>
                              setRevokeTarget({
                                email: openDevicesUser.email,
                                device,
                              })
                            }
                          >
                            <ShieldOff className="h-3.5 w-3.5" />
                            Revoke
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Packs modal */}
      <Dialog
        open={!!packsModalUser}
        onOpenChange={(open) => {
          if (!open) closePacksModal();
        }}
      >
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          {packsModalUser ? (
            <>
              <DialogHeader className="shrink-0 border-b border-border/50 px-6 py-4">
                <DialogTitle>
                  Packs — {packsModalUser.name || packsModalUser.email}
                </DialogTitle>
                <DialogDescription>
                  {packsModalUser.email} · user_{packsModalUser.user_id}
                  {packsData?.subscription_active
                    ? " · subscription active"
                    : null}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
                {packsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : packsError ? (
                  <div
                    role="alert"
                    className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  >
                    {packsError}
                  </div>
                ) : packsData ? (
                  <>
                    <section className="space-y-2">
                      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        Purchased &amp; entitled ({packsData.purchased.length})
                      </h3>
                      {packsData.purchased.length === 0 ? (
                        <p className="text-sm text-muted-foreground">None</p>
                      ) : (
                        <ul className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/50">
                          {packsData.purchased.map((p) => (
                            <li
                              key={`owned-${p.pack_id}`}
                              className="flex items-start justify-between gap-3 px-4 py-3"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">
                                  {p.name}
                                </p>
                                <PackRowMeta
                                  host={p.host}
                                  catalogVersion={p.catalog_version}
                                />
                              </div>
                              <span className="shrink-0 rounded-md bg-foreground/5 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                {accessLabel(p.access)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className="space-y-2">
                      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        Installed on disk ({packsData.installed.length})
                      </h3>
                      {packsData.installed.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No installs reported yet (panel must call
                          telemetry/installs).
                        </p>
                      ) : (
                        <ul className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/50">
                          {packsData.installed.map((p) => (
                            <li
                              key={`inst-${p.pack_id}`}
                              className="px-4 py-3"
                            >
                              <p className="truncate text-sm font-medium text-foreground">
                                {p.name}
                              </p>
                              <PackRowMeta
                                host={p.host}
                                catalogVersion={p.catalog_version}
                                installedVersion={p.installed_version}
                              />
                              <p className="mt-1 text-[11px] text-muted-foreground/80">
                                {p.devices
                                  .map((d) => {
                                    const label =
                                      d.device_name || d.device_id;
                                    return d.installed_version
                                      ? `${label} (${d.installed_version})`
                                      : label;
                                  })
                                  .join(", ")}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className="space-y-2">
                      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        Active now ({packsData.active.length})
                      </h3>
                      {packsData.active.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No active packs reported (panel must call
                          telemetry/active-packs).
                        </p>
                      ) : (
                        <ul className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/50">
                          {packsData.active.map((p) => (
                            <li
                              key={`act-${p.pack_id}`}
                              className="px-4 py-3"
                            >
                              <p className="truncate text-sm font-medium text-foreground">
                                {p.name}
                              </p>
                              <PackRowMeta
                                host={p.host}
                                catalogVersion={p.catalog_version}
                              />
                              <p className="mt-1 text-[11px] text-muted-foreground/80">
                                {p.devices
                                  .map((d) => d.device_name || d.device_id)
                                  .join(", ")}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open && !revoking) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke device?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget
                ? `Sign out ${revokeTarget.email} on ${revokeTarget.device.device_name || revokeTarget.device.device_id}. Other devices for this user stay signed in.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={revoking}
              onClick={() => void confirmRevoke()}
            >
              {revoking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Revoking…
                </>
              ) : (
                "Revoke"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
