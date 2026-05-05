"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { normalizeProductFiles } from "@/lib/product-ui";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ExternalLink, HelpCircle, Package, X } from "lucide-react";
import type { ProductFiles } from "@/lib/product-types";
import { UPLOAD_SUBCATEGORIES, MAX_SUB_CATEGORIES } from "@/lib/author/upload-subcategories";
import type { UploadCategorySlug } from "@/lib/author/upload-categories";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { UploadDropZone } from "@/components/author/upload-drop-zone";

const MAX_TAGS = 25;
const TAG_MAX_LEN = 80;

const schema = z.object({
  name: z.string().min(2).max(100),
  extraSlug: z.string().max(80).optional(),
  description: z.string().max(20000).optional(),
  osCompatibles: z.string().min(2).max(120),
  price: z.coerce.number().min(0).max(500),
  exclusive: z.boolean(),
  subscription: z.boolean(),
});

type Values = z.infer<typeof schema>;

function contributorPreviewSrc(itemId: number, filename: string | undefined): string | null {
  if (!filename) return null;
  const base =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_R2_PUBLIC_CDN ?? "").replace(/\/+$/, "")
      : "";
  if (!base) return null;
  const enc = filename.split("/").map((seg) => encodeURIComponent(seg)).join("/");
  return `${base}/preview/${itemId}/${enc}`;
}

function sectionHeader(title: string, action?: ReactNode) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-300/50 bg-sky-100 px-4 py-2.5 dark:border-sky-800/60 dark:bg-sky-950/50">
      <span className="text-sm font-semibold tracking-tight text-sky-950 dark:text-sky-50">{title}</span>
      {action}
    </div>
  );
}

function tagsFromDb(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS)
    .map((t) => t.slice(0, TAG_MAX_LEN));
}

export function UploadDraftForm({
  indexCategorySlug,
  editItemId,
}: {
  indexCategorySlug: UploadCategorySlug;
  /** Open form for an existing row (`/profile/upload/...?item=`). */
  editItemId?: number;
}) {
  const router = useRouter();
  const [draftId, setDraftId] = useState<number | null>(null);
  const [initializing, setInitializing] = useState(!!editItemId);
  const [files, setFiles] = useState<ProductFiles>({});
  const [descMode, setDescMode] = useState<"visual" | "html">("visual");
  const [subSlugs, setSubSlugs] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [fileSizeAttr, setFileSizeAttr] = useState("");

  const subOptions = UPLOAD_SUBCATEGORIES[indexCategorySlug] ?? [];

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      extraSlug: "",
      description: "",
      osCompatibles: "Windows & Mac OS",
      price: 0,
      exclusive: false,
      subscription: false,
    },
  });

  const watchedPrice = Number(useWatch({ control: form.control, name: "price" }) ?? 0) || 0;
  const commercialUsd = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(watchedPrice * 3);

  const coverPreview = useMemo(
    () => (draftId && files.image ? contributorPreviewSrc(draftId, files.image) : null),
    [draftId, files.image],
  );

  useEffect(() => {
    if (!editItemId) return;
    let cancelled = false;
    (async () => {
      setInitializing(true);
      const res = await fetch(`/api/profile/upload/${editItemId}`, { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        id?: number;
        name?: string;
        description?: string;
        extraSlug?: string | null;
        tags?: string;
        subCategorySlugs?: string[];
        price?: number;
        exclusive?: boolean;
        subscription?: boolean;
        files?: ProductFiles;
        attributes?: { os_compatibles?: string; file_size?: string };
        index_category_slug?: string;
      };
      if (cancelled) return;
      if (!res.ok || !data.id) {
        toast.error(data.error ?? "Could not load this project");
        setInitializing(false);
        return;
      }
      if (data.index_category_slug && data.index_category_slug !== indexCategorySlug) {
        router.replace(`/profile/upload/${data.index_category_slug}?item=${data.id}`);
        return;
      }
      setDraftId(data.id);
      setFiles(normalizeProductFiles(data.files));
      setSubSlugs((data.subCategorySlugs ?? []).slice(0, MAX_SUB_CATEGORIES));
      setTags(data.tags ? tagsFromDb(data.tags) : []);
      setFileSizeAttr(data.attributes?.file_size ?? "");
      setDescMode(
        (data.description ?? "").includes("<") && (data.description ?? "").includes(">") ? "html" : "visual",
      );
      form.reset({
        name: data.name ?? "",
        extraSlug: data.extraSlug ?? "",
        description: data.description ?? "",
        osCompatibles: (data.attributes?.os_compatibles ?? "Windows & Mac OS").trim() || "Windows & Mac OS",
        price: data.price ?? 0,
        exclusive: !!data.exclusive,
        subscription: !!data.subscription,
      });
      setInitializing(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form.reset is stable from useForm
  }, [editItemId, indexCategorySlug, router]);

  const tagsPayload = useCallback(() => tags.join(", ").slice(0, 4000), [tags]);
  const worksWith = indexCategorySlug;

  function addTagsFromInput(raw: string) {
    const parts = raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setTags((prev) => {
      const next = [...prev];
      for (const p of parts) {
        if (next.length >= MAX_TAGS) break;
        const t = p.slice(0, TAG_MAX_LEN);
        if (!next.some((x) => x.toLowerCase() === t.toLowerCase())) next.push(t);
      }
      return next;
    });
    setTagDraft("");
  }

  function toggleSub(slug: string) {
    setSubSlugs((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= MAX_SUB_CATEGORIES) {
        toast.message(`At most ${MAX_SUB_CATEGORIES} sub-categories.`);
        return prev;
      }
      return [...prev, slug];
    });
  }

  async function persistToServer(values: Values, isNewDraft: boolean) {
    const body = {
      indexCategorySlug,
      name: values.name,
      description: values.description ?? "",
      extraSlug: values.extraSlug?.trim() ? values.extraSlug.trim() : null,
      tags: tagsPayload(),
      subCategorySlugs: subSlugs,
      price: values.price,
      exclusive: values.exclusive,
      subscription: values.subscription,
      attributes: {
        works_with: worksWith,
        os_compatibles: values.osCompatibles.trim(),
        file_size: fileSizeAttr || undefined,
      },
    };

    if (isNewDraft) {
      const res = await fetch("/api/profile/upload/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        id?: number;
        attributes?: { file_size?: string };
      };
      if (!res.ok || !data.id) {
        toast.error(data.error ?? "Failed to create draft");
        return false;
      }
      setDraftId(data.id);
      setFiles({});
      setFileSizeAttr(data.attributes?.file_size ?? "");
      toast.success(`Draft #${data.id} saved. You can upload files on the right.`);
      return true;
    }

    if (!draftId) return false;
    const res = await fetch(`/api/profile/upload/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: values.name,
        description: values.description ?? "",
        extraSlug: values.extraSlug?.trim() ? values.extraSlug.trim() : null,
        tags: tagsPayload(),
        subCategorySlugs: subSlugs,
        price: values.price,
        exclusive: values.exclusive,
        subscription: values.subscription,
        attributes: {
          works_with: worksWith,
          os_compatibles: values.osCompatibles.trim(),
          file_size: fileSizeAttr || undefined,
        },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      files?: ProductFiles;
      attributes?: { file_size?: string };
    };
    if (!res.ok) {
      toast.error(data.error ?? "Save failed");
      return false;
    }
    if (data.files) setFiles(data.files);
    if (data.attributes?.file_size) setFileSizeAttr(data.attributes.file_size);
    toast.success("Changes saved.");
    return true;
  }

  async function onUploadContent(values: Values) {
    await persistToServer(values, !draftId);
  }

  const uploadsLocked = !draftId;

  if (initializing) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
        <Package className="h-10 w-10 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">Loading project…</p>
        <p className="text-xs text-muted-foreground">Fetching details and uploaded files.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
        {/* ——— Main column (Laravel “Common” + pricing) ——— */}
        <div className="min-w-0 flex-1 space-y-6">
          <Card className="overflow-hidden border-border/80 shadow-sm">
            {sectionHeader("Common")}
            <CardContent className="space-y-5 p-5 pt-5">
              <Form {...form}>
                <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project name</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Motion Elements Pack" {...field} />
                        </FormControl>
                        <FormDescription>
                          English title in sentence case. Allowed: letters, spaces, apostrophe, numbers and{" "}
                          <code className="rounded bg-muted px-0.5">&amp; ( ) [ ] / | + -</code>. Max 100 characters.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="extraSlug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Extra payment gateway slug (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: gal-premiere-pr" {...field} />
                        </FormControl>
                        <FormDescription>FaspString / Paddle extra item slug when applicable.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-3 md:grid-cols-2">
                    <FormItem>
                      <FormLabel>Works with</FormLabel>
                      <FormControl>
                        <Input value={worksWith} readOnly className="bg-muted/40 font-mono text-xs" />
                      </FormControl>
                      <FormDescription>Saved to <code className="rounded bg-muted px-0.5">attributes.works_with</code>.</FormDescription>
                    </FormItem>
                    <FormField
                      control={form.control}
                      name="osCompatibles"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>OS compatibles</FormLabel>
                          <FormControl>
                            <Input placeholder="Windows & Mac OS" {...field} />
                          </FormControl>
                          <FormDescription>
                            Saved to <code className="rounded bg-muted px-0.5">attributes.os_compatibles</code>.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <FormLabel>Sub-categories</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Pick up to {MAX_SUB_CATEGORIES} labels that fit this project.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {subOptions.map((opt) => {
                        const on = subSlugs.includes(opt.slug);
                        return (
                          <Badge
                            key={opt.slug}
                            variant={on ? "default" : "outline"}
                            className="cursor-pointer px-3 py-1 text-xs font-normal"
                            onClick={() => toggleSub(opt.slug)}
                          >
                            {opt.label}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <FormLabel>Project description</FormLabel>
                      <ToggleGroup
                        type="single"
                        value={descMode}
                        onValueChange={(v) => {
                          if (v === "visual" || v === "html") setDescMode(v);
                        }}
                        variant="outline"
                        size="sm"
                        className="shrink-0 rounded-lg border border-primary/25 bg-primary/5 p-[3px] shadow-none dark:bg-primary/10 **:data-[slot=toggle-group-item]:border-primary/35 **:data-[slot=toggle-group-item]:text-primary/85 **:data-[slot=toggle-group-item]:hover:bg-primary/10 **:data-[slot=toggle-group-item]:data-[state=on]:bg-primary/15 **:data-[slot=toggle-group-item]:data-[state=on]:text-primary"
                      >
                        <ToggleGroupItem value="visual" className="text-xs">
                          Visual editor
                        </ToggleGroupItem>
                        <ToggleGroupItem value="html" className="text-xs">
                          HTML
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea
                              rows={12}
                              className="min-h-[220px] resize-y font-mono text-sm leading-relaxed md:min-h-[280px]"
                              placeholder={
                                descMode === "html"
                                  ? "<p>HTML description…</p>"
                                  : "Write a clear description (plain text for now; rich text can be wired to TipTap later)."
                              }
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            {descMode === "html"
                              ? "Raw HTML is stored in the database as provided."
                              : "Plain text / light markup — same storage as the legacy panel description field."}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <FormLabel>Tags</FormLabel>
                    <Input
                      placeholder="Type a tag and press Enter (or separate with commas)"
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTagsFromInput(tagDraft);
                        }
                      }}
                      onBlur={() => {
                        if (tagDraft.trim()) addTagsFromInput(tagDraft);
                      }}
                    />
                    <FormDescription>
                      English letters, spaces, apostrophe, numbers and hyphen. Max {MAX_TAGS} tags, each up to{" "}
                      {TAG_MAX_LEN} chars.
                    </FormDescription>
                    {tags.length ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {tags.map((t) => (
                          <Badge key={t} variant="secondary" className="gap-1 pr-1 font-normal">
                            {t}
                            <button
                              type="button"
                              className="rounded p-0.5 hover:bg-foreground/10"
                              aria-label={`Remove ${t}`}
                              onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <Separator />

                  <div className="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-4">
                    <p className="text-sm font-semibold text-foreground">Pricing &amp; distribution</p>
                    <FormField
                      control={form.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price (USD) — personal license</FormLabel>
                          <FormControl>
                            <div className="flex flex-wrap items-end gap-3">
                              <Input
                                type="number"
                                min={0}
                                max={500}
                                step={1}
                                placeholder="Ex: 25"
                                className="max-w-[140px]"
                                {...field}
                                value={Number.isFinite(field.value) ? field.value : 0}
                                onChange={(e) =>
                                  field.onChange(e.target.value === "" ? 0 : Number(e.target.value))
                                }
                              />
                              <p className="pb-2 text-sm text-muted-foreground">
                                Commercial license (×3):{" "}
                                <span className="font-semibold tabular-nums text-foreground">{commercialUsd}</span>
                              </p>
                            </div>
                          </FormControl>
                          <FormDescription>
                            Direct-sale price in USD (legacy range about $7–$500). Use 0 for a free item. Extended /
                            commercial multipliers follow your marketplace rules.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="exclusive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border border-border/50 bg-background/50 p-3">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="cursor-pointer font-medium">Exclusive item</FormLabel>
                            <FormDescription>
                              Only for sale on this marketplace — badge and ranking boost (payout % unchanged).
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="subscription"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border border-border/50 bg-background/50 p-3">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="cursor-pointer font-medium">Available by subscription</FormLabel>
                            <FormDescription>
                              Allow subscription downloads in addition to direct sales (profit rules unchanged).
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        {/* ——— Upload column ——— */}
        <aside className="w-full shrink-0 space-y-4 xl:sticky xl:top-20 xl:w-[380px]">
          <Card className="overflow-hidden border-border/80 shadow-sm">
            {sectionHeader(
              "Upload files",
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-sky-800 hover:text-sky-950 dark:text-sky-200"
                onClick={() =>
                  toast.info("Check R2 CORS, file limits, and that the item draft exists.", {
                    description: "Presigned PUT must allow your site origin on the public bucket.",
                  })
                }
              >
                <HelpCircle className="h-3.5 w-3.5" />
                Unable to upload?
              </Button>,
            )}
            <CardContent className="space-y-4 p-4">
              {uploadsLocked ? (
                <p className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
                  Save the form with <strong className="text-foreground">Upload content</strong> below to create a
                  draft, then drag files here.
                </p>
              ) : null}

              {coverPreview ? (
                <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverPreview} alt="Cover preview" className="max-h-48 w-full object-contain" />
                </div>
              ) : null}

              <UploadDropZone
                slot="image"
                itemId={draftId}
                disabled={uploadsLocked}
                current={files.image}
                onUploaded={(payload) => {
                  setFiles(payload.files);
                  if (payload.attributes?.file_size) setFileSizeAttr(payload.attributes.file_size);
                }}
              />
              <UploadDropZone
                slot="video"
                itemId={draftId}
                disabled={uploadsLocked}
                current={files.video}
                onUploaded={(payload) => {
                  setFiles(payload.files);
                  if (payload.attributes?.file_size) setFileSizeAttr(payload.attributes.file_size);
                }}
              />
              <UploadDropZone
                slot="main"
                itemId={draftId}
                disabled={uploadsLocked}
                current={files.main}
                onUploaded={(payload) => {
                  setFiles(payload.files);
                  if (payload.attributes?.file_size) setFileSizeAttr(payload.attributes.file_size);
                }}
              />

              {fileSizeAttr ? (
                <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
                  Project archive size: <span className="font-semibold">{fileSizeAttr}</span>
                </p>
              ) : null}

              <Button variant="link" className="h-auto px-0 text-xs text-primary" asChild>
                <Link href="https://developers.cloudflare.com/r2/buckets/cors/" target="_blank" rel="noreferrer">
                  R2 bucket CORS (browser PUT) <ExternalLink className="ml-1 inline h-3 w-3" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* ——— Footer actions ——— */}
      <div className="space-y-4 border-t border-border/60 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            type="button"
            size="lg"
            className="min-w-[200px]"
            disabled={form.formState.isSubmitting}
            onClick={() => void form.handleSubmit(onUploadContent)()}
          >
            Upload content
          </Button>
          {draftId ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="border-primary/45 text-primary hover:bg-primary/10 dark:hover:bg-primary/15"
                asChild
              >
                <Link href="/profile/items">
                  <Package className="mr-2 h-4 w-4" />
                  My items
                </Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-primary hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/15"
                onClick={() => {
                  setDraftId(null);
                  setFiles({});
                  setFileSizeAttr("");
                  setSubSlugs([]);
                  setTags([]);
                  form.reset();
                  router.refresh();
                  toast.message("Form cleared.");
                }}
              >
                New product
              </Button>
            </>
          ) : null}
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
          By clicking <strong className="text-foreground">Upload content</strong>, you confirm that any third-party
          assets in previews or downloads are properly licensed, and that you have the rights to sell this work on the
          marketplace.
        </p>
      </div>
    </div>
  );
}
