"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ExternalLink, LayoutDashboard, Plus, type LucideIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PACKAGES_AUTHORS, packagesAuthorLogoUrl } from "@/lib/packages-admin-client";
import {
  ACCOUNT_NAVIGATION, AFFILIATE_NAVIGATION, TOOLS_NAVIGATION, PROFILE_NAVIGATION_GROUPS,
  isProfileNavigationActive, managementNavigationItems, profileNavigationGroupForPath,
  type ProfileNavigationGroup,
} from "@/lib/profile-navigation";
import { cn } from "@/lib/utils";

type SidebarAuthor = { id: number; label: string; slug?: string };
interface AccountSidebarProps {
  access: number;
  email?: string | null;
  showPackages?: boolean;
  showPartners?: boolean;
  showUsers?: boolean;
  showAffiliate?: boolean;
}

const focusClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

function NavLink({ href, label, icon: Icon, logoUrl, normalized, active: activeOverride, flat = false }: {
  href: string; label: string; icon?: LucideIcon; logoUrl?: string;
  normalized: string; active?: boolean; flat?: boolean;
}) {
  const active = activeOverride ?? isProfileNavigationActive(normalized, href);
  return (
    <li>
      <Link href={href} aria-current={active ? "page" : undefined} className={cn(
        "relative flex items-center gap-3 text-sm font-medium transition-colors", focusClass,
        flat ? "min-h-11 border-l-2 py-2.5 pr-5 pl-8" : "rounded-lg px-3 py-2.5",
        active
          ? flat ? "border-blue-400 bg-linear-to-r from-blue-600 to-blue-500 text-white" : "bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/20"
          : "border-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-5 w-5 shrink-0 rounded object-contain" />
        ) : Icon ? <Icon aria-hidden className={cn("shrink-0", flat ? "h-4 w-4" : "h-5 w-5", active ? "text-white" : "text-blue-400")} /> : null}
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}

function NavGroup({ group, normalized, open, onOpenChange, children }: {
  group: ProfileNavigationGroup; normalized: string; open: boolean;
  onOpenChange: (open: boolean) => void; children: ReactNode;
}) {
  const { href, label, icon: Icon } = PROFILE_NAVIGATION_GROUPS[group];
  const active = profileNavigationGroupForPath(normalized) === group;
  const selected = normalized === href;
  return (
    <li className="border-b border-border/40">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div className={cn("flex items-center transition-colors", selected ? "bg-linear-to-r from-blue-600 to-blue-500" : active && "bg-blue-500/5")}>
          <Link href={href} aria-current={normalized === href ? "page" : undefined}
            onClick={() => onOpenChange(true)}
            className={cn("flex min-h-14 min-w-0 flex-1 items-center gap-3 py-4 pr-2 pl-6 text-xs font-semibold uppercase tracking-wider transition-colors hover:text-foreground", focusClass, selected ? "text-white hover:text-white" : active ? "text-blue-400" : "text-muted-foreground")}
          >
            <Icon aria-hidden className={cn("h-[18px] w-[18px] shrink-0", selected ? "text-white" : "text-blue-400")} />
            <span className="truncate">{label}</span>
          </Link>
          <CollapsibleTrigger asChild>
            <button type="button" aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
              className={cn("flex min-h-14 w-12 shrink-0 items-center justify-center transition-colors", focusClass, selected ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground")}
            >
              <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <ul aria-label={`${label} menu`} className="pb-3">{children}</ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function AdminNavigation({ access, showPackages, showPartners, showUsers, showAffiliate, authors, normalized }: AccountSidebarProps & { authors: SidebarAuthor[]; normalized: string }) {
  const activeGroup = profileNavigationGroupForPath(normalized);
  const [openGroups, setOpenGroups] = useState<ProfileNavigationGroup[]>(activeGroup ? [activeGroup] : []);
  const toggleGroup = (group: ProfileNavigationGroup) => (open: boolean) => {
    setOpenGroups((current) => open ? [...new Set([...current, group])] : current.filter((item) => item !== group));
  };
  const management = managementNavigationItems({ showPartners, showUsers });
  const authorId = normalized.match(/^\/profile\/(?:packages|extensions)\/(\d+)(?:\/|$)/)?.[1];
  const groupProps = (group: ProfileNavigationGroup) => ({ group, normalized, open: openGroups.includes(group), onOpenChange: toggleGroup(group) });

  return (
    <nav aria-label="Account navigation" className="flex h-full min-h-0 flex-col py-4">
      <div className="shrink-0 px-6 pt-2 pb-6">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Motion Flow</p>
        <p className="mt-1.5 text-lg font-semibold tracking-tight">Admin workspace</p>
      </div>
      <ul aria-label="Workspace sections" className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border/40">
        <NavGroup {...groupProps("account")}>
          {ACCOUNT_NAVIGATION.map((item) => <NavLink key={item.href} {...item} normalized={normalized} flat />)}
          {showAffiliate ? <NavLink {...AFFILIATE_NAVIGATION} normalized={normalized} flat /> : null}
        </NavGroup>
        {showPackages ? <NavGroup {...groupProps("authors")}>
          {authors.map((author) => <NavLink key={author.id} href={`/profile/packages/${author.id}`} label={author.label}
            logoUrl={packagesAuthorLogoUrl(author.slug || author.id)} normalized={normalized} active={Number(authorId) === author.id} flat
          />)}
          <NavLink href="/profile/packages/authors/new" label="Add Author" icon={Plus} normalized={normalized} flat />
        </NavGroup> : null}
        {management.length ? <NavGroup {...groupProps("management")}>
          {management.map((item) => <NavLink key={item.href} {...item} normalized={normalized} flat />)}
        </NavGroup> : null}
        {showUsers ? <NavGroup {...groupProps("tools")}>
          {TOOLS_NAVIGATION.map((item) => <NavLink key={item.href} {...item} normalized={normalized} flat />)}
        </NavGroup> : null}
      </ul>
      {access >= 1 ? <div className="shrink-0 border-t border-border/40 pt-4">
        <a href="https://authors.motionflow.pro" target="_blank" rel="noopener noreferrer"
          className={cn("flex min-h-12 items-center gap-3 px-6 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground", focusClass)}
        >
          <LayoutDashboard aria-hidden className="h-[18px] w-[18px] shrink-0 text-blue-400" />
          <span className="min-w-0 flex-1 truncate">Dashboard</span>
          <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div> : null}
    </nav>
  );
}

export function AccountSidebar(props: AccountSidebarProps) {
  const pathname = usePathname();
  const normalized = pathname.replace(/\/$/, "") || "/";
  const [authors, setAuthors] = useState<SidebarAuthor[]>(PACKAGES_AUTHORS);
  const [compactNavigationOpen, setCompactNavigationOpen] = useState(false);
  const { showPackages, showPartners, showUsers, showAffiliate, access } = props;

  useEffect(() => {
    if (!showPackages) return;
    let cancelled = false;
    const loadAuthors = async () => {
      try {
        const res = await fetch("/api/packages/authors");
        if (!res.ok) return;
        const data = await res.json() as { authors: SidebarAuthor[] };
        if (!cancelled && Array.isArray(data.authors)) setAuthors(data.authors);
      } catch { /* Keep the initial authors when the API is unavailable. */ }
    };
    void loadAuthors();
    window.addEventListener("packages-authors-changed", loadAuthors);
    return () => { cancelled = true; window.removeEventListener("packages-authors-changed", loadAuthors); };
  }, [showPackages]);

  if (showPackages || showPartners || showUsers) {
    if (normalized === "/profile/ai-usage") return <>
      <div className="lg:hidden">
        <button type="button" aria-expanded={compactNavigationOpen} aria-controls="ai-usage-account-navigation"
          onClick={() => setCompactNavigationOpen(value => !value)}
          className={cn("flex min-h-12 w-full items-center justify-between gap-3 px-5 text-sm font-medium", focusClass)}>
          <span>Admin workspace</span><span className="flex items-center gap-2 text-muted-foreground">Navigation<ChevronDown aria-hidden className={cn("size-4", compactNavigationOpen && "rotate-180")} /></span>
        </button>
        {compactNavigationOpen ? <div id="ai-usage-account-navigation" className="max-h-56 overflow-y-auto"><AdminNavigation key={normalized} {...props} authors={authors} normalized={normalized} /></div> : null}
      </div>
      <div className="hidden h-full lg:block"><AdminNavigation key={normalized} {...props} authors={authors} normalized={normalized} /></div>
    </>;
    // Reset expansion on navigation: only the destination group starts open.
    // Manual collapse remains available even while viewing that group.
    return <AdminNavigation key={normalized} {...props} authors={authors} normalized={normalized} />;
  }

  return (
    <nav aria-label="Account navigation" className="flex flex-col gap-4">
      <div className="rounded-xl border border-blue-500/30 bg-card/40 p-2 backdrop-blur-sm glow">
        <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Account</p>
        <ul className="flex flex-col gap-0.5">
          {ACCOUNT_NAVIGATION.map((item) => <NavLink key={item.href} {...item} normalized={normalized} />)}
          {showAffiliate ? <NavLink {...AFFILIATE_NAVIGATION} normalized={normalized} /> : null}
        </ul>
      </div>
      {access >= 1 ? <div className="rounded-xl border border-blue-500/20 bg-card/30 p-2">
        <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Author area</p>
        <Link href="https://authors.motionflow.pro" className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground", focusClass)}>
          <LayoutDashboard className="h-5 w-5 shrink-0 text-blue-400" /> Dashboard
        </Link>
      </div> : null}
    </nav>
  );
}
