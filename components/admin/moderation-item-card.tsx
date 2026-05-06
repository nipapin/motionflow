"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ModerationItemRow } from "@/lib/admin/items-moderation";
import type { Product } from "@/lib/product-types";
import { normalizeProductFiles, productSoftwareLabel, productThumbnailUrl } from "@/lib/product-ui";
import { motionflowItemPageUrl } from "@/lib/motionflow-urls";
import { UPLOAD_CATEGORIES } from "@/lib/author/upload-categories";
import { AdminStatusBadge, moderationBadgeFromRow } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  approveItemAction,
  blockItemAction,
  hardRejectItemAction,
  softRejectItemAction,
  unblockItemAction,
} from "@/app/(adminzone)/_actions/items";

function stubProduct(row: ModerationItemRow): Product {
  return {
    id: row.id,
    author_id: row.author_id,
    access: row.access,
    price: 0,
    team: null,
    exclusive: 0,
    subscription: 0,
    index_category_slug: row.index_category_slug,
    sub_category_slug: "",
    name: row.name,
    description: "",
    description_html: null,
    description_json: {},
    tags: "",
    has_qty: 0,
    attributes: {},
    extra: null,
    json_args: null,
    files: normalizeProductFiles(row.files),
    has_demo: null,
    demo_url: null,
    has_external: null,
    external_domain: null,
    external_url: null,
    youtube_preview: null,
    discount_price: null,
    discount_start: null,
    discount_end: null,
    created_at: "",
    updated_at: "",
  };
}

export function ModerationItemCard({
  row,
  focus,
}: {
  row: ModerationItemRow;
  focus?: boolean;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (focus && rootRef.current) {
      rootRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focus]);

  const [pending, setPending] = React.useState(false);
  const [comment, setComment] = React.useState(row.approval_comment ?? "");
  const p = stubProduct(row);
  const thumb = productThumbnailUrl(p);
  const badge = moderationBadgeFromRow(row.access, row.approval_status);
  const categoryKey = row.index_category_slug.toLowerCase();
  const canEdit = UPLOAD_CATEGORIES.some((c) => c.slug === categoryKey);
  const editHref = `/profile/upload/${row.index_category_slug}?item=${row.id}`;
  const publicHref = motionflowItemPageUrl(p, row.id, row.name);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    try {
      const r = await fn();
      if (r.ok) toast.success("Updated");
      else toast.error(r.error ?? "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="article"
      ref={rootRef}
      id={`moderation-item-${row.id}`}
      className={`card rounded-2xl border border-border/60 p-4 shadow-xs transition-shadow ${focus ? "ring-2 ring-primary/40" : ""}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:w-56">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground">No preview</div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start gap-2">
            <h2 className="text-base font-semibold leading-snug tracking-tight">{row.name}</h2>
            <AdminStatusBadge label={badge.label} tone={badge.tone} />
          </div>
          <p className="text-sm text-muted-foreground">
            #{row.id} · {productSoftwareLabel(p)} · Author:{" "}
            <span className="text-foreground">{row.author_name ?? row.author_id}</span>
          </p>
          {row.approval_comment ? (
            <p className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Reviewer note: </span>
              {row.approval_comment}
            </p>
          ) : null}

          <Textarea
            placeholder="Reason / note (required for reject or block)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[72px] resize-y text-sm"
          />

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" disabled={pending} onClick={() => run(() => approveItemAction(row.id))}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => softRejectItemAction(row.id, comment))}
            >
              Soft reject
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => hardRejectItemAction(row.id, comment))}
            >
              Hard reject
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => blockItemAction(row.id, comment))}>
              Block
            </Button>
            {(row.access === -1 || row.approval_status === "blocked") && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => unblockItemAction(row.id))}>
                Unblock → pending
              </Button>
            )}
            <Button size="sm" variant="outline" asChild>
              <a href={publicHref} target="_blank" rel="noopener noreferrer" className="gap-1">
                View live
                <ExternalLink className="size-3.5 opacity-70" />
              </a>
            </Button>
            {canEdit ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={editHref}>Edit upload</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
