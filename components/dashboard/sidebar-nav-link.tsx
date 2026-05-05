import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarNavLinkProps {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
}

/** Account sidebar: muted by default; primary when active or hovered. */
export function SidebarNavLink({ href, label, icon: Icon, active }: SidebarNavLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium leading-none tracking-tight transition-colors",
        active
          ? "bg-primary/12 text-primary ring-1 ring-primary/25 dark:bg-primary/15"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-[18px] shrink-0 stroke-[1.75]",
          active ? "text-primary opacity-100" : "text-muted-foreground opacity-90 group-hover:text-foreground",
        )}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}
