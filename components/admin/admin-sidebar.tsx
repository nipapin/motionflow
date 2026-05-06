"use client";

import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  ChevronDown,
  Eye,
  Factory,
  Flame,
  FlaskConical,
  FolderOpen,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  Mail,
  Package,
  Percent,
  PieChart,
  Search,
  Settings2,
  Shield,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarNavLink } from "@/components/dashboard/sidebar-nav-link";
import { SidebarNavSection } from "@/components/dashboard/sidebar-nav-section";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

function normalizePath(p: string): string {
  return p.replace(/\/$/, "") || "/";
}

function pathActive(normalized: string, href: string): boolean {
  if (href === "/adminzone/dashboard") {
    return normalized === "/adminzone/dashboard" || normalized === "/adminzone";
  }
  if (href.startsWith("/adminzone/items_access")) {
    return normalized.startsWith("/adminzone/items_access");
  }
  if (href.startsWith("/adminzone/requests")) {
    return normalized.startsWith("/adminzone/requests");
  }
  return normalized === href || normalized.startsWith(`${href}/`);
}

function SubLink({
  href,
  label,
  normalized,
  icon: Icon,
  adminOnly,
  access,
  onNavigate,
}: {
  href: string;
  label: string;
  normalized: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  access: number;
  onNavigate?: () => void;
}) {
  if (adminOnly && access < 100) return null;
  return (
    <SidebarNavLink
      href={href}
      label={label}
      icon={Icon}
      active={pathActive(normalized, href)}
      onNavigate={onNavigate}
    />
  );
}

export function AdminSidebar({
  access,
  className,
  onNavigate,
}: {
  access: number;
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const normalized = normalizePath(pathname);

  return (
    <nav
      className={cn(
        "flex h-full flex-col gap-1 overflow-y-auto border-border/40 px-3 py-4 lg:border-r lg:pr-4",
        className,
      )}
      aria-label="Admin navigation"
    >
      <div className="mb-2 flex items-center gap-2 px-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
          <Shield className="size-[18px] text-primary" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">Admin zone</p>
          <p className="truncate text-[11px] text-muted-foreground">Motion Flow</p>
        </div>
      </div>

      <SidebarNavSection title="Operations">
        <SidebarNavLink
          href="/adminzone/dashboard"
          label="Dashboard"
          icon={LayoutDashboard}
          active={pathActive(normalized, "/adminzone/dashboard")}
          onNavigate={onNavigate}
        />
        <Collapsible
          defaultOpen={
            normalized.startsWith("/adminzone/items_access/wait") ||
            normalized.startsWith("/adminzone/items_access/soft") ||
            normalized.startsWith("/adminzone/items_access/reject") ||
            normalized.startsWith("/adminzone/items_access/blocked")
          }
        >
          <CollapsibleTrigger
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
              pathActive(normalized, "/adminzone/items_access") ? "bg-muted/60 text-foreground" : "",
            )}
          >
            <Package className="size-[18px] shrink-0 opacity-90" aria-hidden />
            <span className="flex-1 truncate">Items</span>
            <ChevronDown className="size-4 shrink-0 opacity-60 transition-transform in-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-0.5 flex flex-col gap-0.5 pl-1">
            <SubLink
              href="/adminzone/items_access/wait"
              label="Wait approve"
              normalized={normalized}
              icon={Eye}
              access={access}
              onNavigate={onNavigate}
            />
            <SubLink
              href="/adminzone/items_access/soft"
              label="Soft rejects"
              normalized={normalized}
              icon={AlertTriangle}
              access={access}
              onNavigate={onNavigate}
            />
            <SubLink
              href="/adminzone/items_access/reject"
              label="Hard rejects"
              normalized={normalized}
              icon={FolderOpen}
              access={access}
              onNavigate={onNavigate}
            />
            <SubLink
              href="/adminzone/items_access/blocked"
              label="Blocked"
              normalized={normalized}
              icon={Flame}
              access={access}
              onNavigate={onNavigate}
            />
          </CollapsibleContent>
        </Collapsible>
        <SidebarNavLink
          href="/adminzone/requests"
          label="Requests"
          icon={LifeBuoy}
          active={pathActive(normalized, "/adminzone/requests")}
          onNavigate={onNavigate}
        />

        <Collapsible defaultOpen={normalized.includes("/adminzone/affiliate") || normalized.includes("/adminzone/coupon") || normalized.includes("/adminzone/offer") || normalized.includes("/adminzone/mailing")}>
          <CollapsibleTrigger
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <Percent className="size-[18px] shrink-0 opacity-90" aria-hidden />
            <span className="flex-1 truncate">Marketing</span>
            <ChevronDown className="size-4 shrink-0 opacity-60 transition-transform in-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-0.5 flex flex-col gap-0.5 pl-1">
            <SubLink
              href="/adminzone/affiliate"
              label="Affiliate"
              normalized={normalized}
              icon={Users}
              access={access}
              onNavigate={onNavigate}
            />
            <SubLink
              href="/adminzone/coupons"
              label="Coupons"
              normalized={normalized}
              icon={Ticket}
              access={access}
              onNavigate={onNavigate}
            />
            <SubLink
              href="/adminzone/offers"
              label="Offers"
              normalized={normalized}
              icon={Flame}
              adminOnly
              access={access}
              onNavigate={onNavigate}
            />
            <SubLink
              href="/adminzone/mailing_marketing"
              label="Mailing marketing"
              normalized={normalized}
              icon={Mail}
              adminOnly
              access={access}
              onNavigate={onNavigate}
            />
          </CollapsibleContent>
        </Collapsible>

        <SidebarNavLink
          href="/adminzone/investment"
          label="Investment"
          icon={PieChart}
          active={pathActive(normalized, "/adminzone/investment")}
          onNavigate={onNavigate}
        />
      </SidebarNavSection>

      <SidebarNavSection title="Management" className="mt-2">
        <Collapsible
          defaultOpen={
            normalized.startsWith("/adminzone/search") ||
            normalized.startsWith("/adminzone/help") ||
            normalized.startsWith("/adminzone/tutorials") ||
            normalized.startsWith("/adminzone/control") ||
            normalized.startsWith("/adminzone/paddle-test-checkout") ||
            normalized.startsWith("/adminzone/subs_users_has_pack_tests") ||
            normalized.startsWith("/adminzone/analytics") ||
            normalized.startsWith("/adminzone/payouts") ||
            normalized.startsWith("/adminzone/page_settings")
          }
        >
          <CollapsibleTrigger
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <Settings2 className="size-[18px] shrink-0 opacity-90" aria-hidden />
            <span className="flex-1 truncate">Tools</span>
            {access >= 100 ? (
              <Badge variant="secondary" className="text-[10px] font-semibold uppercase">
                Admin extras
              </Badge>
            ) : null}
            <ChevronDown className="size-4 shrink-0 opacity-60 transition-transform in-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-0.5 flex flex-col gap-0.5 pl-1">
            <SubLink
              href="/adminzone/search"
              label="Search DB"
              normalized={normalized}
              icon={Search}
              access={access}
              onNavigate={onNavigate}
            />
            <SubLink
              href="/adminzone/help_center"
              label="Help center"
              normalized={normalized}
              icon={BookOpen}
              access={access}
              onNavigate={onNavigate}
            />
            <SubLink
              href="/adminzone/tutorials"
              label="Tutorials"
              normalized={normalized}
              icon={BookOpen}
              access={access}
              onNavigate={onNavigate}
            />
            <SubLink
              href="/adminzone/control"
              label="Control"
              normalized={normalized}
              icon={Shield}
              access={access}
              onNavigate={onNavigate}
            />
            <SubLink
              href="/adminzone/paddle-test-checkout"
              label="Paddle test checkout"
              normalized={normalized}
              icon={Factory}
              access={access}
              onNavigate={onNavigate}
            />
            <SubLink
              href="/adminzone/subs_users_has_pack_tests"
              label="Subs pack tests"
              normalized={normalized}
              icon={FlaskConical}
              access={access}
              onNavigate={onNavigate}
            />
            <SubLink
              href="/adminzone/analytics"
              label="Analytics"
              normalized={normalized}
              icon={LineChart}
              access={access}
              onNavigate={onNavigate}
            />
            <SubLink
              href="/adminzone/payouts"
              label="Payouts"
              normalized={normalized}
              icon={Wallet}
              adminOnly
              access={access}
              onNavigate={onNavigate}
            />
            <SubLink
              href="/adminzone/page_settings"
              label="Page settings"
              normalized={normalized}
              icon={BarChart3}
              adminOnly
              access={access}
              onNavigate={onNavigate}
            />
          </CollapsibleContent>
        </Collapsible>
      </SidebarNavSection>

      <div className="mt-auto border-t border-border/40 pt-4">
        <SidebarNavLink href="/profile" label="Back to account" icon={Users} active={false} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}
