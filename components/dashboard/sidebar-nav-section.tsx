import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SidebarNavSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function SidebarNavSection({ title, children, className }: SidebarNavSectionProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <p className="px-2 pb-1 pt-5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground/65 first:pt-0">
        {title}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
