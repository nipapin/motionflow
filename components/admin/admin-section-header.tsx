import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function AdminSectionHeader({
  title,
  description,
  badge,
  actions,
  backHref,
  backLabel,
}: {
  title: string;
  description?: string;
  badge?: { label: string; tone?: "default" | "secondary" | "outline" | "destructive" };
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        {backHref ? (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {backLabel ?? "Back"}
          </Link>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {badge ? (
            <Badge variant={badge.tone ?? "secondary"} className="text-[11px]">
              {badge.label}
            </Badge>
          ) : null}
        </div>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
