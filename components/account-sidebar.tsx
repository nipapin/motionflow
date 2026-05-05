"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  User,
  ShoppingBag,
  CreditCard,
  Download,
  Bookmark,
  Sparkles,
  LayoutDashboard,
  CloudUpload,
  Briefcase,
  DollarSign,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const accountNav = [
  { href: "/profile", label: "Profile", icon: User },
  { href: "/profile/generations", label: "My generations", icon: Sparkles },
  { href: "/profile/purchases", label: "My purchases", icon: ShoppingBag },
  { href: "/profile/subscriptions", label: "My subscriptions", icon: CreditCard },
  { href: "/profile/downloads", label: "My downloads", icon: Download },
  { href: "/profile/favorites", label: "Favorites", icon: Bookmark },
] as const;

type PartnerNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  minAccess: number;
};

const partnerNav: PartnerNavItem[] = [
  { href: "/profile/dashboard", label: "Dashboard", icon: LayoutDashboard, minAccess: 2 },
  { href: "/profile/upload", label: "Upload", icon: CloudUpload, minAccess: 2 },
  { href: "/profile/items", label: "Items", icon: Briefcase, minAccess: 2 },
  { href: "/profile/earnings/sales", label: "Earnings", icon: DollarSign, minAccess: 1 },
  { href: "/profile/payouts", label: "Payouts", icon: Wallet, minAccess: 1 },
];

function isActive(normalized: string, href: string): boolean {
  if (href === "/profile") return normalized === "/profile";
  if (href === "/profile/earnings/sales") {
    return normalized.startsWith("/profile/earnings");
  }
  return normalized === href || normalized.startsWith(`${href}/`);
}

interface AccountSidebarProps {
  access: number;
}

export function AccountSidebar({ access }: AccountSidebarProps) {
  const pathname = usePathname();
  const normalized = pathname.replace(/\/$/, "") || "/";

  return (
    <nav className="flex flex-col gap-4">
      <div className="rounded-xl border border-blue-500/30 bg-card/40 backdrop-blur-sm p-2 glow">
        <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Account
        </p>
        <ul className="flex flex-col gap-0.5">
          {accountNav.map(({ href, label, icon: Icon }) => {
            const active = isActive(normalized, href);
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
      </div>

      {access >= 1 ? (
        <div className="rounded-xl border border-blue-500/20 bg-card/30 p-2">
          <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Author area
          </p>
          <ul className="flex flex-col gap-0.5">
            {partnerNav.map(({ href, label, icon: Icon, minAccess }) => {
              if (access < minAccess) return null;
              const active = isActive(normalized, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium smooth",
                      active
                        ? "bg-foreground/90 text-background shadow-sm"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("h-5 w-5 shrink-0", active ? "text-background" : "text-blue-400")} />
                    <span className="truncate">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
