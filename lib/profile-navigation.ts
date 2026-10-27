import {
  BarChart3, Bookmark, CreditCard, Download, FileText, Handshake, Mail,
  Settings2, Share2, ShoppingBag, Sparkles, User, UserRound, Users, Wrench,
  type LucideIcon,
} from "lucide-react";

export type ProfileNavigationItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const ACCOUNT_NAVIGATION: ProfileNavigationItem[] = [
  { href: "/profile", label: "Profile", description: "Manage your personal details, email and account security.", icon: User },
  { href: "/profile/generations", label: "My generations", description: "Browse the images, videos and audio you have created.", icon: Sparkles },
  { href: "/profile/purchases", label: "My purchases", description: "View marketplace orders, licenses and purchased products.", icon: ShoppingBag },
  { href: "/profile/subscriptions", label: "My subscriptions", description: "Review your active plans and author library subscriptions.", icon: CreditCard },
  { href: "/profile/downloads", label: "My downloads", description: "Find your downloaded products and revisit your library.", icon: Download },
  { href: "/profile/favorites", label: "Favorites", description: "Return to the templates and products you have saved.", icon: Bookmark },
];

export const AFFILIATE_NAVIGATION: ProfileNavigationItem = {
  href: "/profile/affiliate", label: "Affiliate", description: "Track your referrals, commissions and affiliate payouts.", icon: Share2,
};

export function managementNavigationItems({ showPartners, showUsers }: { showPartners?: boolean; showUsers?: boolean }): ProfileNavigationItem[] {
  return [
    ...(showPartners ? [{ href: "/profile/partners", label: "Partners", description: "Manage affiliate partners, referrals and commissions.", icon: Handshake }] : []),
    ...(showUsers ? [
      { href: "/profile/analytics", label: "Market analytics", description: "See demand, downloads, purchases, tool usage and page heatmaps across your marketplace.", icon: BarChart3 },
      { href: "/profile/ai-usage", label: "AI Usage", description: "Track Replicate generations, model usage and compute time for each author.", icon: Sparkles },
      { href: "/profile/users", label: "Users", description: "Find accounts and manage roles, purchases and access.", icon: UserRound },
      { href: "/profile/campaigns", label: "Campaigns", description: "Create and manage campaigns for your user audiences.", icon: Mail },
    ] : []),
  ];
}

export const TOOLS_NAVIGATION: ProfileNavigationItem[] = [
  { href: "/profile/pdf-link", label: "PDF Links", description: "Upload, replace and organize PDFs with permanent shareable links.", icon: FileText },
];

export const PROFILE_NAVIGATION_GROUPS = {
  account: { href: "/profile/account", label: "Account", description: "Your profile, creative work and personal library, all in one place.", icon: UserRound },
  authors: { href: "/profile/packages", label: "Authors", description: "Manage author libraries, CEP packages and extension users.", icon: Users },
  management: { href: "/profile/management", label: "Management", description: "Manage the people, partnerships and campaigns behind your workspace.", icon: Settings2 },
  tools: { href: "/profile/tools", label: "Tools", description: "Useful tools for publishing and managing your content.", icon: Wrench },
} as const;

export type ProfileNavigationGroup = keyof typeof PROFILE_NAVIGATION_GROUPS;

export function isProfileNavigationActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/$/, "") || "/";
  return path === href || (href !== "/profile" && path.startsWith(`${href}/`));
}

export function profileNavigationGroupForPath(pathname: string): ProfileNavigationGroup | null {
  if (["/profile/packages", "/profile/extensions"].some((href) => isProfileNavigationActive(pathname, href))) return "authors";
  if (["/profile/management", "/profile/partners", "/profile/users", "/profile/campaigns", "/profile/analytics", "/profile/ai-usage"].some((href) => isProfileNavigationActive(pathname, href))) return "management";
  if (["/profile/tools", "/profile/pdf-link"].some((href) => isProfileNavigationActive(pathname, href))) return "tools";
  if (pathname === "/profile/account" || [...ACCOUNT_NAVIGATION, AFFILIATE_NAVIGATION].some(({ href }) => isProfileNavigationActive(pathname, href))) return "account";
  return null;
}
