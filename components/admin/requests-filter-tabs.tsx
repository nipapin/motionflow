import Link from "next/link";
import { cn } from "@/lib/utils";
import type { RequestSortKey } from "@/lib/admin/requests";

const TABS: { key: RequestSortKey; label: string }[] = [
  { key: "assigned", label: "Assigned to you" },
  { key: "all", label: "All open" },
  { key: "business", label: "Business" },
  { key: "support", label: "Support" },
  { key: "become_author", label: "Become author" },
  { key: "become_affiliate", label: "Become affiliate" },
  { key: "bug_report", label: "Bug reports" },
];

export function RequestsFilterTabs({
  active,
  badges,
}: {
  active: RequestSortKey;
  badges: Record<RequestSortKey, number>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => {
        const isActive = active === t.key;
        const count = badges[t.key] ?? 0;

        return (
          <Link
            key={t.key}
            href={`/adminzone/requests?sort=${t.key}`}
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
              {count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
