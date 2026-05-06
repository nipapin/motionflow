"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { HelpArticleDetail, HelpCategoryRow } from "@/lib/admin/help-center";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  createHelpArticleAction,
  createHelpCategoryAction,
  deleteHelpCategoryAction,
  updateHelpArticleAction,
} from "@/app/(adminzone)/_actions/help-center";

export function HelpCenterArticleForm({
  categories,
  article,
}: {
  categories: HelpCategoryRow[];
  article?: HelpArticleDetail;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [categoryId, setCategoryId] = React.useState<number>(
    article?.category_id ?? categories[0]?.id ?? 0,
  );
  const [title, setTitle] = React.useState(article?.title ?? "");
  const [slug, setSlug] = React.useState(article?.slug ?? "");
  const [content, setContent] = React.useState(article?.content ?? "");
  const [visible, setVisible] = React.useState(Boolean(article?.visible ?? 1));

  function submit() {
    startTransition(async () => {
      if (!categoryId) {
        toast.error("Pick a category first");
        return;
      }
      const payload = {
        categoryId,
        title,
        slug: slug || undefined,
        content,
        visible,
      };
      const r = article
        ? await updateHelpArticleAction({ id: article.id, ...payload })
        : await createHelpArticleAction(payload);
      if (r.ok) {
        toast.success(article ? "Article updated" : "Article created");
        if (!article && r.id) {
          router.push(`/adminzone/help_center/edit?id=${r.id}`);
          router.refresh();
        } else {
          router.refresh();
        }
      } else {
        toast.error(r.error ?? "Failed");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            maxLength={70}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is a license?"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            maxLength={70}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="auto-derived from title"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cat">Category</Label>
          <select
            id="cat"
            value={categoryId}
            onChange={(e) => setCategoryId(Number(e.target.value))}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {categories.length === 0 ? <option value={0}>No categories — create one first</option> : null}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.section_slug} / {c.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="visible">Visibility</Label>
            <div className="flex h-10 items-center gap-2">
              <Switch id="visible" checked={visible} onCheckedChange={setVisible} />
              <span className="text-sm text-muted-foreground">{visible ? "Published" : "Hidden"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Article body (HTML)</Label>
        <Textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={14}
          placeholder="<p>Article HTML…</p>  — Editor.js parity is on the roadmap (lib/admin/help-center.ts)."
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Laravel writes both HTML (`content`) and Editor.js JSON (`content_json`). Until Editor.js is wired here we save the HTML you paste and clear the JSON column.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={submit} disabled={pending || !title.trim()}>
          {article ? "Save changes" : "Create article"}
        </Button>
        <Button variant="outline" type="button" disabled={pending} onClick={() => router.push("/adminzone/help_center")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function HelpCategoryQuickAdd({ sections }: { sections: { slug: string; title: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const [sectionSlug, setSectionSlug] = React.useState(sections[0]?.slug ?? "");
  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();

  function submit() {
    startTransition(async () => {
      const r = await createHelpCategoryAction({
        sectionSlug,
        title,
        slug: slug || undefined,
      });
      if (r.ok) {
        toast.success("Category created");
        setOpen(false);
        setTitle("");
        setSlug("");
        router.refresh();
      } else {
        toast.error(r.error ?? "Failed");
      }
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Add category
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="space-y-1">
        <Label className="text-xs">Section</Label>
        <select
          value={sectionSlug}
          onChange={(e) => setSectionSlug(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {sections.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 w-44" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Slug (optional)</Label>
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="h-9 w-44" />
      </div>
      <Button size="sm" disabled={pending || !title.trim()} onClick={submit}>
        Create
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

export function HelpCategoryRow({
  category,
}: {
  category: HelpCategoryRow;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function remove() {
    if (!confirm(`Delete category “${category.title}”? Articles must be moved first.`)) return;
    startTransition(async () => {
      const r = await deleteHelpCategoryAction(category.id);
      if (r.ok) {
        toast.success("Category removed");
        router.refresh();
      } else {
        toast.error(r.error ?? "Failed");
      }
    });
  }

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-border/40 px-3 py-2 text-sm">
      <span>
        <span className="font-medium">{category.title}</span>{" "}
        <span className="text-xs text-muted-foreground">/{category.section_slug}/{category.slug}</span>
      </span>
      <Button size="sm" variant="ghost" disabled={pending} onClick={remove}>
        Remove
      </Button>
    </li>
  );
}
