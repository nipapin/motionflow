"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, ShoppingBag, CreditCard, Download, Bookmark, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/profile", label: "Profile", icon: User },
  { href: "/profile/generations", label: "My generations", icon: Sparkles },
  { href: "/profile/purchases", label: "My purchases", icon: ShoppingBag },
  { href: "/profile/subscriptions", label: "My subscriptions", icon: CreditCard },
  { href: "/profile/downloads", label: "My downloads", icon: Download },
  { href: "/profile/favorites", label: "Favorites", icon: Bookmark },
] as const;

export function AccountSidebar() {
  const pathname = usePathname();
  const normalized = pathname.replace(/\/$/, "") || "/";

  return (
    <nav className="rounded-xl border border-blue-500/30 bg-card/40 backdrop-blur-sm p-2 glow">
      <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Account
      </p>
      <ul className="flex flex-col gap-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = normalized === href;
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium smooth",
                  active
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/20"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5 shrink-0", active ? "text-white" : "text-blue-400")} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
