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
  ChevronDown,
  Users,
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

const navItemBase =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium smooth";

type SidebarAuthor = { id: number; label: string; slug?: string };

interface AccountSidebarProps {
  access: number;
  email?: string | null;
  showPackages?: boolean;
}

function AuthorSubmenu({
  authors,
  normalized,
  open,
  onToggle,
}: {
  authors: SidebarAuthor[];
  normalized: string;
  open: boolean;
  onToggle: () => void;
}) {
  const onSection =
    normalized.startsWith("/profile/packages") ||
    normalized.startsWith("/profile/extensions");
  const activeAuthorId = (() => {
    const m = normalized.match(
      /^\/profile\/(?:packages|extensions)\/(\d+)/,
    );
    return m ? Number(m[1]) : null;
  })();

  return (
    <li>
      <div
        className={cn(
          "flex items-center rounded-lg text-sm font-medium smooth",
          onSection
            ? "bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/20"
            : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
        )}
      >
        <Link
          href="/profile/packages"
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5"
        >
          <Users
            className={cn(
              "h-5 w-5 shrink-0",
              onSection ? "text-white" : "text-blue-400",
            )}
          />
          <span className="truncate">Authors</span>
        </Link>
        <button
          type="button"
          aria-label={open ? "Collapse Authors" : "Expand Authors"}
          className={cn(
            "shrink-0 rounded-r-lg px-2.5 py-2.5",
            onSection ? "text-white/80 hover:text-white" : "hover:text-foreground",
          )}
          onClick={(e) => {
            e.preventDefault();
            if (onSection) return;
            onToggle();
          }}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition", open && "rotate-180")}
          />
        </button>
      </div>
      {open ? (
        <ul className="mt-0.5 flex flex-col gap-0.5 pl-2">
          {authors.map((a) => {
            const href = `/profile/packages/${a.id}`;
            const active = activeAuthorId === a.id;
            return (
              <li key={a.id}>
                <Link
                  href={href}
                  className={cn(
                    navItemBase,
                    active
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={packagesAuthorLogoUrl(a.slug || a.id)}
                    alt=""
                    className="h-5 w-5 shrink-0 rounded object-contain"
                  />
                  <span className="truncate">{a.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

export function AccountSidebar({ access, showPackages }: AccountSidebarProps) {
  const pathname = usePathname();
  const normalized = pathname.replace(/\/$/, "") || "/";
  const onPackages =
    normalized.startsWith("/profile/packages") ||
    normalized.startsWith("/profile/extensions");
  const [packagesManualOpen, setPackagesManualOpen] = useState(onPackages);
  const [authors, setAuthors] = useState<SidebarAuthor[]>(PACKAGES_AUTHORS);

  useEffect(() => {
    if (onPackages) setPackagesManualOpen(true);
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

  const packagesOpen = onPackages || packagesManualOpen;

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
                    navItemBase,
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
            <AuthorSubmenu
              authors={authors}
              normalized={normalized}
              open={packagesOpen}
              onToggle={() => setPackagesManualOpen((v) => !v)}
            />
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
              className={cn(
                navItemBase,
                "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
              )}
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
