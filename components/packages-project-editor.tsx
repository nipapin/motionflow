"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronsUpDown,
  ImageIcon,
  Loader2,
  RefreshCw,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { getPackagesAuthorPublicById } from "@/lib/packages-admin-client";
import { parseMarketplaceItemIdInput } from "@/lib/packages-marketplace-id";
import { cn } from "@/lib/utils";

const DEFAULT_PAID_PRICE = 9.99;

type Project = {
  id: number;
  author_id: number;
  name: string;
  version: string | null;
  host: "PR" | "AE";
  min_extension_version: string | null;
  min_host_version: string | null;
  details_url: string | null;
  marketplace_item_id: number | null;
  previewUrl: string | null;
  downloadKey: string | null;
  downloadUrl: string | null;
  price: number;
  visible: boolean;
  admin_only: boolean;
};

type ZipOption = {
  key: string;
  size: number;
};

function zipFileName(key: string): string {
  const parts = key.split("/").filter(Boolean);
  return parts[parts.length - 1] || key;
}

function formatBytes(n: number): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function PackagesProjectEditor({
  authorId,
  itemId,
}: {
  authorId: number;
  itemId: number;
}) {
  const author = getPackagesAuthorPublicById(authorId);
  const [project, setProject] = useState<Project | null>(null);
  const [authorBucket, setAuthorBucket] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [host, setHost] = useState<"PR" | "AE">("AE");
  const [minExt, setMinExt] = useState("");
  const [minHost, setMinHost] = useState("");
  const [detailsUrl, setDetailsUrl] = useState("");
  const [marketplaceItemId, setMarketplaceItemId] = useState("");
  const [visible, setVisible] = useState(false);
  const [adminOnly, setAdminOnly] = useState(false);
  const [freePack, setFreePack] = useState(true);
  const [price, setPrice] = useState(String(DEFAULT_PAID_PRICE));
  const [lastPaidPrice, setLastPaidPrice] = useState(DEFAULT_PAID_PRICE);
  const [downloadKey, setDownloadKey] = useState("");
  const [previewBroken, setPreviewBroken] = useState(false);
  const [zips, setZips] = useState<ZipOption[]>([]);
  const [zipsError, setZipsError] = useState<string | null>(null);
  const [zipsLoading, setZipsLoading] = useState(false);
  const [zipPickerOpen, setZipPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [projRes, authorRes] = await Promise.all([
        fetch(`/api/packages/${authorId}/projects/${itemId}`),
        fetch(`/api/packages/authors/${authorId}`),
      ]);
      if (!projRes.ok) throw new Error(await projRes.text());
      const data = (await projRes.json()) as { project: Project };
      setProject(data.project);
      setName(data.project.name);
      setVersion(data.project.version || "");
      setHost(data.project.host === "PR" ? "PR" : "AE");
      setMinExt(data.project.min_extension_version || "");
      setMinHost(data.project.min_host_version || "");
      setDetailsUrl(data.project.details_url || "");
      setMarketplaceItemId(
        data.project.marketplace_item_id != null
          ? String(data.project.marketplace_item_id)
          : "",
      );
      setVisible(Boolean(data.project.visible));
      setAdminOnly(Boolean(data.project.admin_only));
      const loadedPrice = Number(data.project.price) || 0;
      const isFree = loadedPrice <= 0;
      setFreePack(isFree);
      if (loadedPrice > 0) {
        setLastPaidPrice(loadedPrice);
        setPrice(String(loadedPrice));
      } else {
        setPrice(String(DEFAULT_PAID_PRICE));
      }
      setDownloadKey(data.project.downloadKey || "");
      setPreviewBroken(false);

      if (authorRes.ok) {
        const a = (await authorRes.json()) as { author: { r2_bucket: string | null } };
        setAuthorBucket(a.author.r2_bucket);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [authorId, itemId]);

  const loadZips = useCallback(async () => {
    setZipsLoading(true);
    setZipsError(null);
    try {
      const res = await fetch(`/api/packages/${authorId}/r2?zips=1`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setZipsError(body.message || body.error || "Could not load archives");
        setZips([]);
        return;
      }
      const data = (await res.json()) as {
        zips: ZipOption[];
        bucket?: string | null;
      };
      setZips(data.zips || []);
      if (data.bucket) setAuthorBucket(data.bucket);
    } catch {
      setZipsError("Could not load archives");
    } finally {
      setZipsLoading(false);
    }
  }, [authorId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (authorBucket) void loadZips();
  }, [authorBucket, loadZips]);

  const setFeedback = (text: string, ok: boolean) => {
    setMsg(text);
    setMsgOk(ok);
  };

  const saveAll = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const parsedPrice = freePack
        ? 0
        : Math.max(0, Number.parseFloat(price) || 0) || DEFAULT_PAID_PRICE;
      const marketRaw = marketplaceItemId.trim();
      const res = await fetch(`/api/packages/${authorId}/projects/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          version: version || null,
          host,
          min_extension_version: minExt || null,
          min_host_version: minHost || null,
          details_url: detailsUrl || null,
          // Empty Marketplace Item → try Package page URL; still empty clears the link.
          marketplace_item_id: marketRaw || parseMarketplaceItemIdInput(detailsUrl),
          visible,
          admin_only: adminOnly,
          price: parsedPrice,
          downloadKey: downloadKey || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { project: Project };
      setProject(data.project);
      setName(data.project.name);
      setDetailsUrl(data.project.details_url || "");
      setMarketplaceItemId(
        data.project.marketplace_item_id != null
          ? String(data.project.marketplace_item_id)
          : "",
      );
      setVisible(Boolean(data.project.visible));
      setAdminOnly(Boolean(data.project.admin_only));
      const savedPrice = Number(data.project.price) || 0;
      setFreePack(savedPrice <= 0);
      if (savedPrice > 0) {
        setLastPaidPrice(savedPrice);
        setPrice(String(savedPrice));
      }
      setDownloadKey(data.project.downloadKey || "");
      setFeedback("Saved", true);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Save failed", false);
    } finally {
      setBusy(false);
    }
  };

  const uploadPreview = async (file: File) => {
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.set("kind", "preview");
      form.set("file", file);
      const res = await fetch(
        `/api/packages/${authorId}/projects/${itemId}/upload`,
        { method: "POST", body: form },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
        };
        throw new Error(body.message || body.error || `Upload failed (${res.status})`);
      }
      const data = (await res.json()) as { project: Project };
      setProject(data.project);
      setPreviewBroken(false);
      setFeedback("Preview updated", true);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Upload failed", false);
    } finally {
      setBusy(false);
    }
  };

  if (!author) {
    return <p className="text-sm text-destructive">Unknown author.</p>;
  }

  if (error) {
    return (
      <div className="w-full space-y-4">
        <Link
          href={`/profile/packages/${authorId}`}
          className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="w-full space-y-8">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="aspect-video w-full rounded-lg" />
        </div>
      </div>
    );
  }

  const zipOptions =
    downloadKey && !zips.some((z) => z.key === downloadKey)
      ? [{ key: downloadKey, size: 0 }, ...zips]
      : zips;

  const hostLabel = host === "PR" ? "Premiere" : "After Effects";

  return (
    <div className="w-full pb-28">
      <nav className="mb-6 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Link
          href={`/profile/packages/${authorId}`}
          className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {author.label}
        </Link>
        <span className="text-muted-foreground/40" aria-hidden>
          /
        </span>
        <span className="truncate text-foreground/80">{name || "Untitled"}</span>
      </nav>

      <header className="mb-8">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="pack-name" className="sr-only">
            Pack name
          </Label>
          <input
            id="pack-name"
            className={cn(
              "w-full min-w-0 bg-transparent text-3xl font-semibold tracking-tight",
              "border-0 px-0 py-1 outline-none",
              "placeholder:text-muted-foreground/50",
            )}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Pack name"
          />
          <p className="text-[13px] text-muted-foreground">
            #{project.id} · {author.label}
          </p>
        </div>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)] lg:gap-10">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pack-version">Version</Label>
            <Input
              id="pack-version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
            />
          </div>
          <div className="space-y-2">
            <Label>Application</Label>
            <div
              className="inline-flex h-9 w-full rounded-md border border-input p-0.5"
              role="group"
              aria-label="Host application"
            >
              {(
                [
                  { id: "PR" as const, label: "Premiere" },
                  { id: "AE" as const, label: "After Effects" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={cn(
                    "flex-1 rounded-[5px] px-3 text-[13px] font-medium transition-colors",
                    host === opt.id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setHost(opt.id)}
                  aria-pressed={host === opt.id}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="min-ext">Min extension version</Label>
            <Input
              id="min-ext"
              value={minExt}
              onChange={(e) => setMinExt(e.target.value)}
              placeholder="1.0.0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="min-host">Min {hostLabel} version</Label>
            <Input
              id="min-host"
              value={minHost}
              onChange={(e) => setMinHost(e.target.value)}
              placeholder="24.0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pack-price">Price (USD)</Label>
            <Input
              id="pack-price"
              type="number"
              min={0}
              step="0.01"
              disabled={freePack}
              value={freePack ? "0" : price}
              onChange={(e) => {
                setPrice(e.target.value);
                const n = Number.parseFloat(e.target.value);
                if (Number.isFinite(n) && n > 0) setLastPaidPrice(n);
              }}
              placeholder={String(DEFAULT_PAID_PRICE)}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="marketplace-item">Marketplace Item</Label>
            <Input
              id="marketplace-item"
              value={marketplaceItemId}
              onChange={(e) => setMarketplaceItemId(e.target.value)}
              onBlur={() => {
                const parsed = parseMarketplaceItemIdInput(marketplaceItemId);
                if (parsed != null) setMarketplaceItemId(String(parsed));
              }}
              placeholder="1138 or Package Page URL"
              inputMode="numeric"
            />
            <p className="text-[12px] text-muted-foreground">
              Links this CEP pack to a purchased{" "}
              <code className="text-[11px]">marketplace_items</code> row. Paste an
              id or a Package Page URL (last path segment is the id).
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="details-url">Package page</Label>
            <Input
              id="details-url"
              value={detailsUrl}
              onChange={(e) => setDetailsUrl(e.target.value)}
              onBlur={() => {
                if (marketplaceItemId.trim()) return;
                const parsed = parseMarketplaceItemIdInput(detailsUrl);
                if (parsed != null) setMarketplaceItemId(String(parsed));
              }}
              placeholder="https://motionflow.pro/item/{id}"
            />
            <p className="text-[12px] text-muted-foreground">
              Next.js on the main site:{" "}
              <code className="text-[11px]">/item/{"{id}"}</code>. Laravel catalog
              stays on author subdomains (
              <code className="text-[11px]">spunkram.motionflow.pro/item/…</code>
              ).
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="zip-file">Project source</Label>
              {authorBucket && !zipsLoading && !zipsError ? (
                <span className="text-[12px] text-muted-foreground">
                  {zips.length} zip{zips.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            {!authorBucket ? (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-300/90">
                Set an R2 bucket in{" "}
                <Link
                  href={`/profile/packages/${authorId}`}
                  className="font-medium underline underline-offset-2 hover:opacity-80"
                >
                  author settings
                </Link>{" "}
                first.
              </p>
            ) : zipsError ? (
              <p className="text-sm text-destructive" role="alert">
                {zipsError}
              </p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Popover open={zipPickerOpen} onOpenChange={setZipPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="zip-file"
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={zipPickerOpen}
                      disabled={busy || zipsLoading}
                      className="h-9 min-w-0 flex-1 justify-between font-normal"
                    >
                      <span className="truncate text-left">
                        {zipsLoading
                          ? "Loading zips…"
                          : downloadKey
                            ? zipFileName(downloadKey)
                            : "Select a zip…"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-(--radix-popover-trigger-width) p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput placeholder="Search zip files…" />
                      <CommandList className="max-h-72">
                        <CommandEmpty>No zip found.</CommandEmpty>
                        <CommandGroup>
                          {downloadKey ? (
                            <CommandItem
                              value="__clear__"
                              onSelect={() => {
                                setDownloadKey("");
                                setZipPickerOpen(false);
                              }}
                              className="text-muted-foreground"
                            >
                              Clear selection
                            </CommandItem>
                          ) : null}
                          {zipOptions.map((z) => (
                            <CommandItem
                              key={z.key}
                              value={z.key}
                              onSelect={() => {
                                setDownloadKey(z.key);
                                setZipPickerOpen(false);
                              }}
                              className="items-start gap-2"
                            >
                              <Check
                                className={cn(
                                  "mt-0.5 h-3.5 w-3.5 shrink-0",
                                  downloadKey === z.key
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">
                                  {zipFileName(z.key)}
                                </span>
                                {z.key !== zipFileName(z.key) ? (
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {z.key}
                                  </span>
                                ) : null}
                              </span>
                              {z.size > 0 ? (
                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                  {formatBytes(z.size)}
                                </span>
                              ) : null}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 shrink-0 gap-1.5 text-muted-foreground"
                  disabled={busy || zipsLoading}
                  onClick={() => void loadZips()}
                >
                  {zipsLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Refresh
                </Button>
              </div>
            )}
            {authorBucket && zips.length === 0 && !zipsLoading && !zipsError ? (
              <p className="text-[13px] text-muted-foreground">
                No zips in this bucket yet.
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-3 lg:sticky lg:top-24">
          <Label>Preview</Label>
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted/40">
            {project.previewUrl && !previewBroken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={project.previewUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => setPreviewBroken(true)}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <ImageIcon className="h-5 w-5 text-muted-foreground/50" aria-hidden />
                <span className="text-[12px] text-muted-foreground">16:9</span>
              </div>
            )}
          </div>
          <label className="inline-flex">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPreview(f);
                e.target.value = "";
              }}
            />
            <Button type="button" size="sm" variant="outline" disabled={busy} asChild>
              <span>Upload preview</span>
            </Button>
          </label>

          <div className="rounded-2xl border border-border/60 bg-card px-4 py-1">
            <label className="flex cursor-pointer items-center justify-between gap-3 py-3">
              <span className="text-[13px] font-medium text-foreground">Enabled</span>
              <Checkbox
                checked={visible}
                onCheckedChange={(checked) => setVisible(checked === true)}
                aria-label="Enabled"
              />
            </label>
            <div className="border-t border-border/50" />
            <label className="flex cursor-pointer items-center justify-between gap-3 py-3">
              <span className="text-[13px] font-medium text-foreground">Admin Only</span>
              <Checkbox
                checked={adminOnly}
                onCheckedChange={(checked) => setAdminOnly(checked === true)}
                aria-label="Admin Only"
              />
            </label>
            <div className="border-t border-border/50" />
            <label className="flex cursor-pointer items-center justify-between gap-3 py-3">
              <span className="text-[13px] font-medium text-foreground">Free</span>
              <Checkbox
                checked={freePack}
                onCheckedChange={(checked) => {
                  const on = checked === true;
                  setFreePack(on);
                  if (!on) {
                    setPrice(
                      String(lastPaidPrice > 0 ? lastPaidPrice : DEFAULT_PAID_PRICE),
                    );
                  } else {
                    const n = Number.parseFloat(price);
                    if (Number.isFinite(n) && n > 0) setLastPaidPrice(n);
                  }
                }}
                aria-label="Free"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="flex w-full items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
          <p
            className={cn(
              "min-h-5 text-[13px] transition-opacity",
              msg
                ? msgOk
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-destructive"
                : "text-transparent",
            )}
            role="status"
            aria-live="polite"
          >
            {msgOk && msg ? (
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" aria-hidden />
                {msg}
              </span>
            ) : (
              msg || "—"
            )}
          </p>
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5"
            disabled={busy}
            onClick={() => void saveAll()}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
