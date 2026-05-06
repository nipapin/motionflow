"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  TUTORIAL_CATEGORIES,
  type TutorialItemDetail,
  type TutorialLocaleRow,
} from "@/lib/admin/tutorials";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  createTutorialAction,
  updateTutorialAction,
} from "@/app/(adminzone)/_actions/tutorials";

function defaultCategoryKey(item?: TutorialItemDetail): string {
  if (item?.category_slug && item.sub_category_slug) {
    return `${item.category_slug}@${item.sub_category_slug}`;
  }
  const first = TUTORIAL_CATEGORIES[0];
  if (!first) return "";
  const firstSub = Object.keys(first.sub_categories)[0] ?? "";
  return `${first.slug}@${firstSub}`;
}

export function TutorialForm({
  tutorial,
  locales,
}: {
  tutorial?: TutorialItemDetail;
  locales?: TutorialLocaleRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [categoryKey, setCategoryKey] = React.useState(defaultCategoryKey(tutorial));
  const [title, setTitle] = React.useState(tutorial?.title ?? "");
  const [slug, setSlug] = React.useState(tutorial?.slug ?? "");
  const [description, setDescription] = React.useState(tutorial?.description ?? "");
  const [content, setContent] = React.useState(tutorial?.content ?? "");
  const [visible, setVisible] = React.useState(Boolean(tutorial?.visible ?? 0));
  const [label, setLabel] = React.useState<string>(tutorial?.label ?? "");

  function submit() {
    startTransition(async () => {
      const payload = {
        categoryKey,
        title,
        slug: slug || undefined,
        description,
        content,
        visible,
        label: label || null,
      };
      const r = tutorial
        ? await updateTutorialAction({ id: tutorial.id, ...payload })
        : await createTutorialAction(payload);
      if (r.ok) {
        toast.success(tutorial ? "Tutorial updated" : "Tutorial created");
        if (!tutorial && r.id) {
          router.push(`/adminzone/tutorials/edit?id=${r.id}`);
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
          <Input id="title" maxLength={70} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input id="slug" maxLength={70} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from title" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cat">Category / sub-category</Label>
          <select
            id="cat"
            value={categoryKey}
            onChange={(e) => setCategoryKey(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {TUTORIAL_CATEGORIES.flatMap((c) =>
              Object.entries(c.sub_categories).map(([k, sub]) => (
                <option key={`${c.slug}@${k}`} value={`${c.slug}@${k}`}>
                  {c.title} → {sub.name}
                </option>
              )),
            )}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Visibility</Label>
            <div className="flex h-10 items-center gap-2">
              <Switch checked={visible} onCheckedChange={setVisible} />
              <span className="text-sm text-muted-foreground">{visible ? "Published" : "Hidden"}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <select
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">—</option>
              <option value="featured">Featured</option>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="desc">Mini description (≤ 100 chars)</Label>
        <Textarea
          id="desc"
          rows={2}
          maxLength={100}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Article body (HTML)</Label>
        <Textarea
          id="content"
          rows={16}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Editor.js authoring (with poster upload + lang locales) is on the roadmap. The HTML you paste is stored as-is.
        </p>
      </div>

      {tutorial && locales ? (
        <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Locales</p>
          {locales.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No translations. Laravel ports use `articles_locales` (`bind_type = 'tutorial'`); Next.js form parity is pending.
            </p>
          ) : (
            <ul className="space-y-1">
              {locales.map((loc) => (
                <li key={loc.id} className="flex items-center justify-between text-xs">
                  <span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {loc.lang}
                    </Badge>{" "}
                    {loc.title}
                  </span>
                  <span className="text-muted-foreground">{loc.visible ? "visible" : "hidden"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={submit} disabled={pending || !title.trim()}>
          {tutorial ? "Save changes" : "Create tutorial"}
        </Button>
        <Button variant="outline" type="button" disabled={pending} onClick={() => router.push("/adminzone/tutorials")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
