"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
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
  Handshake,
  Share2,
  UserRound,
  Mail,
  FileText,
  Plus,
  ExternalLink,
  Settings2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function NavLink({ href, label, icon: Icon, normalized }: {
  href: string;
  label: string;
  icon: LucideIcon;
  normalized: string;
}) {
  const active = isActive(normalized, href);
  return (
    <li>
      <Link href={href} aria-current={active ? "page" : undefined} className={cn(
        navItemBase,
        active
          ? "bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/20"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}>
        <Icon className={cn("h-5 w-5 shrink-0", active ? "text-white" : "text-blue-400")} />
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}

function NavGroup({ label, icon: Icon, active, normalized, children }: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  normalized: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active, normalized]);

  return (
    <li>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Icon aria-hidden className="h-5 w-5 shrink-0 text-blue-400" />
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mb-1 flex flex-col gap-0.5">{children}</ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

type SidebarAuthor = { id: number; label: string; slug?: string };

interface AccountSidebarProps {
  access: number;
  email?: string | null;
  showPackages?: boolean;
  /** Admin: manage subscription affiliates. */
  showPartners?: boolean;
  /** Admin: search and grant users. */
  showUsers?: boolean;
  /** The signed-in user is a subscription affiliate. */
  showAffiliate?: boolean;
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
          aria-expanded={open}
          aria-controls="account-sidebar-authors"
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
        <ul id="account-sidebar-authors" className="mt-0.5 flex flex-col gap-0.5 pl-2">
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
          <NavLink href="/profile/packages/authors/new" label="Add Author" icon={Plus} normalized={normalized} />
        </ul>
      ) : null}
    </li>
  );
}

export function AccountSidebar({
  access,
  showPackages,
  showPartners,
  showUsers,
  showAffiliate,
}: AccountSidebarProps) {
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
    const loadAuthors = async () => {
      try {
        const res = await fetch("/api/packages/authors");
        if (!res.ok) return;
        const data = (await res.json()) as { authors: SidebarAuthor[] };
        if (!cancelled && data.authors?.length) setAuthors(data.authors);
      } catch {
        /* keep seed */
      }
    };
    void loadAuthors();
    window.addEventListener("packages-authors-changed", loadAuthors);
    return () => {
      cancelled = true;
      window.removeEventListener("packages-authors-changed", loadAuthors);
    };
  }, [showPackages]);

  const packagesOpen = onPackages || packagesManualOpen;
  const adminMenu = Boolean(showPackages || showPartners || showUsers);
  const managementNav = [
    ...(showPartners ? [{ href: "/profile/partners", label: "Partners", icon: Handshake }] : []),
    ...(showUsers ? [
      { href: "/profile/users", label: "Users", icon: UserRound },
      { href: "/profile/campaigns", label: "Campaigns", icon: Mail },
    ] : []),
  ];
  const accountLinks = <>
    {accountNav.map((item) => <NavLink key={item.href} {...item} normalized={normalized} />)}
    {showAffiliate ? <NavLink href="/profile/affiliate" label="Affiliate" icon={Share2} normalized={normalized} /> : null}
  </>;

  return (
    <nav aria-label="Account navigation" className="flex flex-col gap-4">
      <div className="rounded-xl border border-blue-500/30 bg-card/40 backdrop-blur-sm p-2 glow">
        {!adminMenu ? <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Account
        </p> : null}
        <ul className="flex flex-col gap-0.5">
          {adminMenu ? <NavGroup label="Account" icon={UserRound} normalized={normalized} active={accountNav.some(({ href }) => isActive(normalized, href)) || isActive(normalized, "/profile/affiliate")}>
            {accountLinks}
          </NavGroup> : accountLinks}
          {showPackages ? (
            <AuthorSubmenu
              authors={authors}
              normalized={normalized}
              open={packagesOpen}
              onToggle={() => setPackagesManualOpen((v) => !v)}
            />
          ) : null}
          {managementNav.length ? <NavGroup label="Management" icon={Settings2} normalized={normalized} active={managementNav.some(({ href }) => isActive(normalized, href))}>
            {managementNav.map((item) => <NavLink key={item.href} {...item} normalized={normalized} />)}
          </NavGroup> : null}
          {showUsers ? <NavGroup label="Tools" icon={Wrench} normalized={normalized} active={false}>
            <NavLink href="https://motionflow.pro/pdf-link" label="PDF Links" icon={FileText} normalized={normalized} />
          </NavGroup> : null}
          {adminMenu && access >= 1 ? <li>
            <a href="https://authors.motionflow.pro" target="_blank" rel="noopener noreferrer" className={cn(navItemBase, "text-muted-foreground hover:bg-foreground/5 hover:text-foreground")}>
              <LayoutDashboard className="h-5 w-5 shrink-0 text-blue-400" />
              <span className="min-w-0 flex-1 truncate">Dashboard</span>
              <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li> : null}
        </ul>
      </div>

      {!adminMenu && access >= 1 ? (
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
