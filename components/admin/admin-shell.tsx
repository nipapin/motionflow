"use client";

import * as React from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { AdminCommandPalette } from "@/components/admin/admin-command-palette";

export function AdminShell({
  access,
  userName,
  children,
}: {
  access: number;
  userName: string;
  children: React.ReactNode;
}) {
  const [mobileNav, setMobileNav] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-[260px] shrink-0 lg:block">
        <AdminSidebar access={access} className="sticky top-0 h-screen" />
      </aside>

      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-[280px] max-w-[85vw] border-border/60 p-0">
          <AdminSidebar access={access} className="h-full border-0" onNavigate={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar
          userName={userName}
          onOpenMobileNav={() => setMobileNav(true)}
          onOpenCommand={() => setCommandOpen(true)}
        />
        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>

      <AdminCommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
