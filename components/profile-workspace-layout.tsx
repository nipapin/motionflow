import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ProfileWorkspaceLayout({ admin, sidebar, children }: {
  admin: boolean; sidebar: ReactNode; children: ReactNode;
}) {
  return (
    <div data-slot="profile-workspace" className={cn("flex flex-col lg:flex-row", admin
      ? "min-h-[calc(100dvh-8rem)] rounded-2xl border border-border/60 bg-card/20"
      : "gap-6 lg:gap-8")}
    >
      <aside className={admin
        ? "shrink-0 rounded-t-2xl border-b border-border/50 bg-card/50 lg:w-64 lg:rounded-l-2xl lg:rounded-tr-none lg:border-r lg:border-b-0"
        : "shrink-0 lg:sticky lg:top-22 lg:w-60 lg:self-start"}
      >
        <div className={admin ? "lg:sticky lg:top-22" : undefined}>{sidebar}</div>
      </aside>
      <div data-slot="profile-content" className={cn("min-w-0 flex-1", admin && "p-5 sm:p-6 lg:p-8")}>{children}</div>
    </div>
  );
}
