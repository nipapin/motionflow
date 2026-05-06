"use client";

import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TITLE_MAP: Array<{ prefix: string; title: string }> = [
  { prefix: "/adminzone/dashboard", title: "Dashboard" },
  { prefix: "/adminzone/items_access", title: "Items moderation" },
  { prefix: "/adminzone/requests/view", title: "Request detail" },
  { prefix: "/adminzone/requests", title: "Requests" },
  { prefix: "/adminzone/affiliate", title: "Affiliate" },
  { prefix: "/adminzone/coupons", title: "Coupons" },
  { prefix: "/adminzone/offers", title: "Offers" },
  { prefix: "/adminzone/mailing_marketing", title: "Mailing marketing" },
  { prefix: "/adminzone/search", title: "Search" },
  { prefix: "/adminzone/help_center", title: "Help center" },
  { prefix: "/adminzone/tutorials", title: "Tutorials" },
  { prefix: "/adminzone/control", title: "Control" },
  { prefix: "/adminzone/analytics", title: "Analytics" },
  { prefix: "/adminzone/payouts", title: "Payouts" },
  { prefix: "/adminzone/page_settings", title: "Page settings" },
  { prefix: "/adminzone/investment", title: "Investment" },
  { prefix: "/adminzone/paddle-test-checkout", title: "Paddle test checkout" },
  { prefix: "/adminzone/subs_users_has_pack_tests", title: "Subs pack tests" },
];

function titleFromPath(pathname: string): string {
  const n = pathname.replace(/\/$/, "") || "/";
  for (const { prefix, title } of TITLE_MAP) {
    if (n === prefix || n.startsWith(`${prefix}/`)) return title;
  }
  return "Admin zone";
}

export function AdminTopbar({
  userName,
  onOpenMobileNav,
  onOpenCommand,
  className,
}: {
  userName: string;
  onOpenMobileNav: () => void;
  onOpenCommand: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const title = titleFromPath(pathname);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md md:px-6",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold tracking-tight md:text-lg">{title}</h1>
        <p className="truncate text-xs text-muted-foreground md:text-[13px]">{userName}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="hidden gap-2 sm:inline-flex"
        onClick={onOpenCommand}
      >
        <Search className="size-4 opacity-70" aria-hidden />
        Search…
        <kbd className="pointer-events-none hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </Button>
      <Button type="button" variant="outline" size="icon" className="sm:hidden" onClick={onOpenCommand} aria-label="Open search">
        <Search className="size-4" />
      </Button>
    </header>
  );
}
