import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfileEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** Dashed, low-contrast panel for empty / informational states across /profile. */
export function ProfileEmptyState({
  icon: Icon,
  title,
  description,
  className,
  children,
}: ProfileEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <div
          className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted/40 ring-1 ring-border/50"
          aria-hidden
        >
          <Icon className="size-5 text-muted-foreground" strokeWidth={1.5} />
        </div>
      ) : null}
      <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
      {description ? (
        <div className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">{description}</div>
      ) : null}
      {children ? <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  );
}
