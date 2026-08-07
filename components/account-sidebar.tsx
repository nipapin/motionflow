"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  User,
  ShoppingBag,
  CreditCard,
  Download,
  Bookmark,
  Sparkles,
  LayoutDashboard,
  Package,
  ChevronDown,
} from "lucide-react";
import { PACKAGES_AUTHORS } from "@/lib/packages-admin-client";
import { cn } from "@/lib/utils";

const accountNav = [
  { href: "/profile", label: "Profile", icon: User },
  { href: "/profile/generations", label: "My generations", icon: Sparkles },
  { href: "/profile/purchases", label: "My purchases", icon: ShoppingBag },
  { href: "/profile/subscriptions", label: "My subscriptions", icon: CreditCard },
  { href: "/profile/downloads", label: "My downloads", icon: Download },
  { href: "/profile/favorites", label: "Favorites", icon: Bookmark },
] as const;

function isActive(normalized: string, href: string): boolean {
  if (href === "/profile") return normalized === "/profile";
  if (href === "/profile/earnings/sales") {
    return normalized.startsWith("/profile/earnings");
  }
  return normalized === href || normalized.startsWith(`${href}/`);
}

interface AccountSidebarProps {
  access: number;
  email?: string | null;
  showPackages?: boolean;
}

export function AccountSidebar({ access, showPackages }: AccountSidebarProps) {
  const pathname = usePathname();
  const normalized = pathname.replace(/\/$/, "") || "/";
  const packagesOpen =
    normalized.startsWith("/profile/packages") || undefined;
  const [open, setOpen] = useState(Boolean(packagesOpen));

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
                      ? "bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/20"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      active ? "text-white" : "text-blue-400",
                    )}
                  />
                  {label}
                </Link>
              </li>
            );
          })}
          {showPackages ? (
            <li>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium smooth",
                  isActive(normalized, "/profile/packages")
                    ? "bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/20"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                )}
              >
                <Package
                  className={cn(
                    "h-5 w-5 shrink-0",
                    isActive(normalized, "/profile/packages")
                      ? "text-white"
                      : "text-blue-400",
                  )}
                />
                <span className="flex-1 text-left">Packages</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 transition",
                    open && "rotate-180",
                  )}
                />
              </button>
              {open ? (
                <ul className="mt-0.5 ml-4 border-l border-border/50 pl-2 space-y-0.5">
                  <li>
                    <Link
                      href="/profile/packages"
                      className={cn(
                        "block rounded-md px-2.5 py-1.5 text-xs font-medium",
                        normalized === "/profile/packages"
                          ? "text-blue-300"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      All authors
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/profile/packages/authors"
                      className={cn(
                        "block rounded-md px-2.5 py-1.5 text-xs font-medium",
                        normalized === "/profile/packages/authors" ||
                          normalized.startsWith("/profile/packages/authors/")
                          ? "bg-blue-500/15 text-blue-200"
                          : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
                      )}
                    >
                      Authors settings
                    </Link>
                  </li>
                  {PACKAGES_AUTHORS.map((a) => {
                    const href = `/profile/packages/${a.id}`;
                    const active = normalized === href || normalized.startsWith(`${href}/`);
                    return (
                      <li key={a.id}>
                        <Link
                          href={href}
                          className={cn(
                            "block rounded-md px-2.5 py-1.5 text-xs font-medium",
                            active
                              ? "bg-blue-500/15 text-blue-200"
                              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
                          )}
                        >
                          {a.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          ) : null}
        </ul>
      </div>

      {access >= 1 ? (
        <div className="rounded-xl border border-blue-500/20 bg-card/30 p-2">
          <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Author area
          </p>
          <div className="flex flex-col gap-0.5">
            <Link
              href="https://authors.motionflow.pro"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium smooth text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            >
              <LayoutDashboard className="h-5 w-5 shrink-0 text-blue-400" />
              <span className="truncate">Dashboard</span>
            </Link>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
