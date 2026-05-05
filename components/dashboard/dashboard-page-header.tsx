import type { ReactNode } from "react";

interface DashboardPageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

/** Page shell: clear title / meta / optional right rail (8px rhythm). */
export function DashboardPageHeader({ title, description, actions }: DashboardPageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <div className="text-[13px] leading-relaxed text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
