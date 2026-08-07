"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { PackagesR2Browser, type R2BrowserObject } from "@/components/packages-r2-browser";
import { Button } from "@/components/ui/button";
import { packagesAuthorLogoUrl } from "@/lib/packages-admin-client";

type AuthorDto = {
  id: number;
  slug: string;
  label: string;
  r2_bucket: string | null;
  r2_prefix: string;
  demo_pr_key: string | null;
  demo_ae_key: string | null;
  demo_pr_version: string | null;
  demo_ae_version: string | null;
  logoUrl?: string;
};

type DemoHost = "PR" | "AE";

export function PackagesAuthorsAdmin() {
  const [authors, setAuthors] = useState<AuthorDto[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [r2Bucket, setR2Bucket] = useState("");
  const [r2Prefix, setR2Prefix] = useState("");
  const [demoPrVersion, setDemoPrVersion] = useState("");
  const [demoAeVersion, setDemoAeVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [r2Objects, setR2Objects] = useState<R2BrowserObject[]>([]);
  const [pickerHost, setPickerHost] = useState<DemoHost | null>(null);

  const selected = authors.find((a) => a.id === selectedId) ?? null;

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/packages/authors");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { authors: AuthorDto[] };
      setAuthors(data.authors || []);
      setSelectedId((prev) => prev ?? data.authors?.[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setLabel(selected.label);
    setR2Bucket(selected.r2_bucket || "");
    setR2Prefix(selected.r2_prefix || "");
    setDemoPrVersion(selected.demo_pr_version || "");
    setDemoAeVersion(selected.demo_ae_version || "");
    setMsg(null);
  }, [selected]);

  const loadR2 = useCallback(async (authorId: number) => {
    try {
      const res = await fetch(`/api/packages/${authorId}/r2`);
      if (!res.ok) return;
      const data = (await res.json()) as { objects: R2BrowserObject[] };
      setR2Objects(data.objects || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (pickerHost && selectedId) void loadR2(selectedId);
  }, [pickerHost, selectedId, loadR2]);

  const saveAuthor = async () => {
    if (!selectedId) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/packages/authors/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          r2_bucket: r2Bucket || null,
          r2_prefix: r2Prefix,
          demo_pr_version: demoPrVersion || null,
          demo_ae_version: demoAeVersion || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { author: AuthorDto };
      setAuthors((prev) =>
        prev.map((a) => (a.id === data.author.id ? { ...a, ...data.author } : a)),
      );
      setMsg("Author saved");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const uploadDemo = async (host: DemoHost, file: File) => {
    if (!selectedId) return;
    setBusy(true);
    setMsg(null);
    try {
      const version =
        (host === "PR" ? demoPrVersion : demoAeVersion) || "1.0.0";
      const pre = await fetch(`/api/packages/${selectedId}/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host,
          version,
          contentType: file.type || "application/zip",
        }),
      });
      if (!pre.ok) throw new Error(await pre.text());
      const signed = (await pre.json()) as {
        putUrl: string;
        bindValue: string;
        version: string;
      };
      const put = await fetch(signed.putUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/zip" },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed ${put.status}`);

      const patch = await fetch(`/api/packages/${selectedId}/demo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host,
          key: signed.bindValue,
          version: signed.version,
        }),
      });
      if (!patch.ok) throw new Error(await patch.text());
      await load();
      setMsg(`Demo ${host} uploaded`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Demo upload failed");
    } finally {
      setBusy(false);
    }
  };

  const bindDemo = async (host: DemoHost, obj: R2BrowserObject) => {
    if (!selectedId) return;
    setBusy(true);
    setMsg(null);
    try {
      const version = (host === "PR" ? demoPrVersion : demoAeVersion) || "1.0.0";
      const res = await fetch(`/api/packages/${selectedId}/demo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, key: obj.key, version }),
      });
      if (!res.ok) throw new Error(await res.text());
      setPickerHost(null);
      await load();
      setMsg(`Demo ${host} bound to ${obj.key}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Bind failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 w-full">
      <div>
        <Link
          href="/profile/packages"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Packages
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Authors</h1>
        <p className="text-sm text-muted-foreground mt-1">
          R2 bucket / prefix and demo packs (Premiere + After Effects) per author.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <ul className="space-y-1">
          {authors.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setSelectedId(a.id)}
                className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                  selectedId === a.id
                    ? "border-blue-500/40 bg-blue-500/10"
                    : "border-border/60 bg-card/30 hover:bg-foreground/5"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.logoUrl || packagesAuthorLogoUrl(a.slug)}
                  alt=""
                  className="h-7 w-7 rounded object-contain bg-muted/40 p-0.5"
                />
                <span className="truncate">{a.label}</span>
              </button>
            </li>
          ))}
        </ul>

        {selected ? (
          <div className="space-y-4 rounded-xl border border-blue-500/20 bg-card/40 p-4">
            <p className="text-xs text-muted-foreground">
              #{selected.id} · {selected.slug}
            </p>
            <label className="block text-xs text-muted-foreground">
              Label
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              R2 bucket (empty = default public/private env)
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
                value={r2Bucket}
                onChange={(e) => setR2Bucket(e.target.value)}
                placeholder="motionflow-public"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              R2 prefix
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
                value={r2Prefix}
                onChange={(e) => setR2Prefix(e.target.value)}
                placeholder="public/downloads/…"
              />
            </label>
            <Button type="button" size="sm" disabled={busy} onClick={() => void saveAuthor()}>
              <Save className="h-3.5 w-3.5 mr-1" />
              Save author
            </Button>

            {(["PR", "AE"] as const).map((host) => {
              const key = host === "PR" ? selected.demo_pr_key : selected.demo_ae_key;
              const version =
                host === "PR" ? demoPrVersion : demoAeVersion;
              const setVersion =
                host === "PR" ? setDemoPrVersion : setDemoAeVersion;
              return (
                <div
                  key={host}
                  className="rounded-lg border border-border/60 p-3 space-y-2"
                >
                  <h3 className="text-sm font-semibold">
                    Demo pack · {host === "PR" ? "Premiere" : "After Effects"}
                  </h3>
                  <label className="block text-xs text-muted-foreground">
                    Version
                    <input
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      placeholder="1.0.0"
                    />
                  </label>
                  <p className="text-xs text-muted-foreground break-all">
                    {key || "No demo zip linked"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex">
                      <input
                        type="file"
                        accept=".zip,application/zip"
                        className="hidden"
                        disabled={busy}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadDemo(host, f);
                          e.target.value = "";
                        }}
                      />
                      <Button type="button" size="sm" variant="outline" disabled={busy} asChild>
                        <span>Upload zip</span>
                      </Button>
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        setPickerHost((v) => (v === host ? null : host))
                      }
                    >
                      {pickerHost === host ? "Hide picker" : "Bind from R2"}
                    </Button>
                  </div>
                  {pickerHost === host ? (
                    <PackagesR2Browser
                      objects={r2Objects}
                      onSelectFile={(o) => void bindDemo(host, o)}
                    />
                  ) : null}
                </div>
              );
            })}

            {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
            {busy ? (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select an author.</p>
        )}
      </div>
    </div>
  );
}
