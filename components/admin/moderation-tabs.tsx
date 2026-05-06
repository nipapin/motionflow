import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ModerationTab } from "@/lib/admin/items-moderation";

const TABS: { id: ModerationTab; label: string }[] = [
  { id: "wait", label: "Wait approve" },
  { id: "soft", label: "Soft rejects" },
  { id: "reject", label: "Hard rejects" },
  { id: "blocked", label: "Blocked" },
];

export function ModerationTabs({
  active,
  counts,
}: {
  active: ModerationTab;
  counts: Record<ModerationTab, number>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => {
        const isActive = active === t.id;
        return (
          <Link
            key={t.id}
            href={`/adminzone/items_access/${t.id}`}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
              isActive
                ? "border-primary/50 bg-primary/12 text-primary ring-1 ring-primary/20"
                : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {t.label}
            <span
              className={cn(
                "tabular-nums rounded-md px-1.5 py-0.5 text-[11px]",
                isActive ? "bg-primary/20 text-primary" : "bg-background/80 text-muted-foreground",
              )}
            >
              {counts[t.id] ?? 0}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
