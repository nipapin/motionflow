import Link from "next/link";
import { Download, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ItemStatus } from "@/components/dashboard/item-status";
import { AuthorItemDeleteButton } from "@/components/dashboard/author-item-delete-button";

interface AuthorItemCardProps {
  itemId: number;
  name: string;
  previewUrl: string | null;
  softwareLabel: string;
  statusLabel: string;
  access: number;
  canEdit: boolean;
  editHref: string;
  marketplaceHref: string;
}

/** Dense marketplace-style tile: preview-first, quiet chrome, actions on hover. */
export function AuthorItemCard({
  itemId,
  name,
  previewUrl,
  softwareLabel,
  statusLabel,
  access,
  canEdit,
  editHref,
  marketplaceHref,
}: AuthorItemCardProps) {
  const processing = access === -10;

  return (
    <article
      className={cn(
        "group/card flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-md shadow-black/8",
        "ring-1 ring-border/25 transition-[border-color,box-shadow,ring-color] duration-200",
        "dark:shadow-[0_14px_36px_-12px_rgba(0,0,0,0.48)] dark:ring-border/45",
        "hover:border-border hover:shadow-lg hover:shadow-black/12 dark:hover:shadow-[0_18px_44px_-12px_rgba(0,0,0,0.55)]",
      )}
    >
      <div className="relative aspect-video bg-muted/70 ring-1 ring-inset ring-border/40 dark:bg-muted/85">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 px-3 text-center">
            <span className="text-[11px] font-medium text-muted-foreground">No preview</span>
            <span className="text-[10px] text-muted-foreground/70">Upload cover in editor</span>
          </div>
        )}
        {processing ? (
          <span className="absolute left-2 top-2 rounded-md bg-background/85 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground ring-1 ring-border/50 backdrop-blur-sm">
            Processing
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 border-t border-border bg-muted/20 p-3 dark:bg-accent/15">
        <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-foreground">{name}</h3>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {softwareLabel ? (
            <span className="text-[11px] text-muted-foreground">{softwareLabel}</span>
          ) : (
            <span />
          )}
          <ItemStatus access={access} label={statusLabel} />
        </div>

        <div className="mt-auto flex items-center justify-end gap-0.5 border-border/30 pt-2 opacity-90 transition-opacity group-hover/card:opacity-100">
          {canEdit ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-primary/85 hover:bg-primary/10 hover:text-primary"
              asChild
            >
              <Link href={editHref} title="Edit">
                <Pencil className="size-3.5" strokeWidth={1.75} />
                <span className="sr-only">Edit</span>
              </Link>
            </Button>
          ) : null}
          {canEdit && access !== 1 ? <AuthorItemDeleteButton itemId={itemId} itemName={name} /> : null}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-primary/85 hover:bg-primary/10 hover:text-primary"
            asChild
          >
            <a href={marketplaceHref} target="_blank" rel="noopener noreferrer" title="Open on marketplace">
              <Download className="size-3.5" strokeWidth={1.75} />
              <span className="sr-only">Open on marketplace</span>
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}
