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
import { SidebarNavLink } from "@/components/dashboard/sidebar-nav-link";
import { SidebarNavSection } from "@/components/dashboard/sidebar-nav-section";

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
    <nav className="flex flex-col lg:sticky lg:top-28 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pb-8 lg:border-r lg:border-border/40 lg:pr-6">
      <SidebarNavSection title="Account">
        {accountNav.map(({ href, label, icon }) => (
          <SidebarNavLink key={href} href={href} label={label} icon={icon} active={isActive(normalized, href)} />
        ))}
      </SidebarNavSection>

      {access >= 1 ? (
        <SidebarNavSection title="Creator" className="mt-6">
          {partnerNav.map(({ href, label, icon, minAccess }) => {
            if (access < minAccess) return null;
            return (
              <SidebarNavLink key={href} href={href} label={label} icon={icon} active={isActive(normalized, href)} />
            );
          })}
        </SidebarNavSection>
      ) : null}

      {access >= 2 ? (
        <div className="mt-5 px-2">
          <Link
            href="/profile/upload"
            className="flex items-center justify-center rounded-lg border border-primary/45 bg-primary/10 px-3 py-2 text-[13px] font-semibold text-primary shadow-xs transition-colors hover:bg-primary/15"
          >
            New upload
          </Link>
        </div>
      ) : null}
    </nav>
  );
}
