import Link from "next/link";
import { ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const PROFILE_CARD_GRID = "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

export function ProfileNavigationCard({ href, label, description, icon: Icon, logoUrl, meta, action = "Open section", create }: {
  href: string;
  label: string;
  description: string;
  icon?: LucideIcon;
  logoUrl?: string;
  meta?: string;
  action?: string;
  create?: boolean;
}) {
  return (
    <Link href={href} className={cn(
      "group relative flex h-full min-h-60 flex-col rounded-2xl border bg-card/45 p-6 transition duration-200",
      "hover:-translate-y-0.5 hover:border-blue-500/50 hover:bg-blue-500/5 hover:shadow-lg hover:shadow-blue-950/10",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none",
      create ? "border-dashed border-blue-500/35" : "border-border/60",
    )}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-xl", logoUrl ? "bg-muted/70 p-2.5" : "bg-blue-500/10 text-blue-400")}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-full w-full object-contain" />
          ) : Icon ? <Icon aria-hidden className="h-6 w-6" /> : null}
        </div>
        <ArrowUpRight aria-hidden className="h-4 w-4 text-muted-foreground/50 transition-colors group-hover:text-blue-400" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{label}</h2>
      {meta ? <p className="mt-1.5 truncate font-mono text-xs text-muted-foreground">{meta}</p> : null}
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/40 pt-4 text-xs font-medium text-muted-foreground transition-colors group-hover:text-blue-400">
        <span className="pt-3">{action}</span>
        <ArrowRight aria-hidden className="mt-3 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
