import Link from "next/link";
import { cn } from "@/lib/utils";

interface ItemsScopeToggleProps {
  team: boolean;
}

export function ItemsScopeToggle({ team }: ItemsScopeToggleProps) {
  return (
    <div
      className="inline-flex rounded-[10px] bg-primary/[0.07] p-1 ring-1 ring-primary/25 dark:bg-primary/10"
      role="tablist"
      aria-label="Item scope"
    >
      <Link
        href="/profile/items"
        role="tab"
        aria-selected={!team}
        className={cn(
          "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
          !team
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-primary/80 hover:bg-primary/10 hover:text-primary",
        )}
      >
        My items
      </Link>
      <Link
        href="/profile/items?team=1"
        role="tab"
        aria-selected={team}
        className={cn(
          "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
          team ? "bg-primary text-primary-foreground shadow-sm" : "text-primary/80 hover:bg-primary/10 hover:text-primary",
        )}
      >
        Team items
      </Link>
    </div>
  );
}
