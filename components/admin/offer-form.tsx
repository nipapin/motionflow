"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  OFFER_TYPES,
  type OfferDetail,
} from "@/lib/admin/offers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createOfferAction,
  updateOfferAction,
} from "@/app/(adminzone)/_actions/offers";

function isoLocal(s: string | null | undefined): string {
  if (!s) return "";
  try {
    const d = new Date(s);
    const off = d.getTimezoneOffset() * 60 * 1000;
    return new Date(d.getTime() - off).toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

export function OfferForm({ offer }: { offer?: OfferDetail }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [type, setType] = React.useState(offer?.type ?? "offer");
  const [title, setTitle] = React.useState(offer?.title ?? "");
  const [shortTitle, setShortTitle] = React.useState(offer?.short_title ?? "");
  const [subtitle, setSubtitle] = React.useState(offer?.subtitle ?? "");
  const [slug, setSlug] = React.useState(offer?.slug ?? "");
  const [visible, setVisible] = React.useState(Boolean(offer?.visible ?? 0));
  const [categories, setCategories] = React.useState((offer?.categories_arr ?? []).join(","));
  const [items, setItems] = React.useState((offer?.items_arr ?? []).join(","));
  const [startAt, setStartAt] = React.useState(isoLocal(offer?.start_at));
  const [endAt, setEndAt] = React.useState(isoLocal(offer?.end_at));

  function submit() {
    startTransition(async () => {
      const payload = {
        title,
        shortTitle,
        subtitle,
        slug: slug || null,
        type,
        visible,
        selectCategories: categories,
        itemsList: items,
        startAt: startAt || null,
        endAt: endAt || null,
      };
      const r = offer
        ? await updateOfferAction({ id: offer.id, ...payload })
        : await createOfferAction(payload);
      if (r.ok) {
        toast.success(offer ? "Offer updated" : "Offer created");
        if (!offer && r.id) {
          router.push(`/adminzone/offers/edit?id=${r.id}`);
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
          <Label htmlFor="title">Page title</Label>
          <Input id="title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="short">Card / sidebar title (≤ 70)</Label>
          <Input
            id="short"
            maxLength={70}
            value={shortTitle}
            onChange={(e) => setShortTitle(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            maxLength={60}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="auto from short title"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Offer type</Label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {OFFER_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subtitle">Subtitle (optional)</Label>
        <Textarea
          id="subtitle"
          rows={2}
          maxLength={250}
          value={subtitle ?? ""}
          onChange={(e) => setSubtitle(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cats">Categories (comma-separated slugs)</Label>
          <Input
            id="cats"
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            placeholder="footages,after-effects"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="items">Item IDs (comma-separated)</Label>
          <Input id="items" value={items} onChange={(e) => setItems(e.target.value)} placeholder="optional pinned items" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="start">Starts at</Label>
          <Input
            id="start"
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end">Ends at</Label>
          <Input
            id="end"
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-3">
        <div>
          <p className="text-sm font-medium">Visible</p>
          <p className="text-xs text-muted-foreground">Drafts are hidden from public listings.</p>
        </div>
        <Switch checked={visible} onCheckedChange={setVisible} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={submit} disabled={pending || !title.trim() || !shortTitle.trim()}>
          {offer ? "Save changes" : "Create offer"}
        </Button>
        <Button variant="outline" type="button" disabled={pending} onClick={() => router.push("/adminzone/offers")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
