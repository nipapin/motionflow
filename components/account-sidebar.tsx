"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  Settings2,
} from "lucide-react";
import { PACKAGES_AUTHORS, packagesAuthorLogoUrl } from "@/lib/packages-admin-client";
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

type SidebarAuthor = { id: number; label: string; slug?: string };

interface AccountSidebarProps {
  access: number;
  email?: string | null;
  showPackages?: boolean;
}

export function AccountSidebar({ access, showPackages }: AccountSidebarProps) {
  const pathname = usePathname();
  const normalized = pathname.replace(/\/$/, "") || "/";
  const onPackages = normalized.startsWith("/profile/packages");
  const [manualOpen, setManualOpen] = useState(onPackages);
  const [authors, setAuthors] = useState<SidebarAuthor[]>(PACKAGES_AUTHORS);

  // Keep Packages submenu open while on any packages route (fixes collapse trapping nav).
  useEffect(() => {
    if (onPackages) setManualOpen(true);
  }, [onPackages]);

  useEffect(() => {
    if (!showPackages) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/packages/authors");
        if (!res.ok) return;
        const data = (await res.json()) as { authors: SidebarAuthor[] };
        if (!cancelled && data.authors?.length) setAuthors(data.authors);
      } catch {
        /* keep seed */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showPackages]);

  const packagesOpen = onPackages || manualOpen;

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
              <div
                className={cn(
                  "flex items-center rounded-lg text-sm font-medium smooth",
                  onPackages
                    ? "bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/20"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                )}
              >
                <Link
                  href="/profile/packages"
                  className="flex flex-1 items-center gap-3 px-3 py-2.5 min-w-0"
                >
                  <Package
                    className={cn(
                      "h-5 w-5 shrink-0",
                      onPackages ? "text-white" : "text-blue-400",
                    )}
                  />
                  <span className="truncate">Packages</span>
                </Link>
                <button
                  type="button"
                  aria-label={packagesOpen ? "Collapse Packages" : "Expand Packages"}
                  className={cn(
                    "shrink-0 px-2.5 py-2.5 rounded-r-lg",
                    onPackages ? "text-white/80 hover:text-white" : "hover:text-foreground",
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    if (onPackages) return; // stay open on packages routes
                    setManualOpen((v) => !v);
                  }}
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition",
                      packagesOpen && "rotate-180",
                    )}
                  />
                </button>
              </div>
              {packagesOpen ? (
                <ul className="mt-0.5 ml-4 border-l border-border/50 pl-2 space-y-0.5">
                  <li>
                    <Link
                      href="/profile/packages"
                      className={cn(
                        "block rounded-md px-2.5 py-1.5 text-xs font-medium",
                        normalized === "/profile/packages"
                          ? "bg-blue-500/15 text-blue-200"
                          : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
                      )}
                    >
                      All authors
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/profile/packages/authors"
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium",
                        normalized === "/profile/packages/authors" ||
                          normalized.startsWith("/profile/packages/authors/")
                          ? "bg-blue-500/15 text-blue-200"
                          : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
                      )}
                    >
                      <Settings2 className="h-3 w-3 shrink-0 opacity-70" />
                      Authors settings
                    </Link>
                  </li>
                  {authors.map((a) => {
                    const href = `/profile/packages/${a.id}`;
                    const active =
                      normalized === href || normalized.startsWith(`${href}/`);
                    return (
                      <li key={a.id}>
                        <Link
                          href={href}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium",
                            active
                              ? "bg-blue-500/15 text-blue-200"
                              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={packagesAuthorLogoUrl(a.slug || a.id)}
                            alt=""
                            className="h-3.5 w-3.5 rounded object-contain"
                          />
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
