"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import Image from "next/image";
import {
  Home,
  Music,
  Menu,
  X,
  AudioLines,
  PanelLeftClose,
  PanelLeftOpen,
  Film,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { SidebarGenerationBalance } from "@/components/sidebar-generation-balance";
import { FREE_GENERATIONS_LIMIT } from "@/lib/generation-limits";
import { useGenerations } from "@/hooks/use-generations";
import { MAIN_HEADER_AUTHORS_LINKS } from "@/components/main-header-authors-popover";

const categories = [
  { name: "Home", icon: Home, href: "/" },
  { name: "AI Tools", icon: Sparkles, href: "/ai-tools" },
  { name: "After Effects", text: "Ae", href: "/after-effects" },
  { name: "Premiere Pro", text: "Pr", href: "/premiere-pro" },
  { name: "DaVinci Resolve", text: "Dr", href: "/davinci-resolve" },
  // { name: "Illustrator", text: "Ai", href: "/illustrator" },
  { name: "Stock Music", icon: Music, href: "/stock-audio" },
  { name: "Sound FX", icon: AudioLines, href: "/sound-fx" },
  { name: "Footages", icon: Film, href: "/footages" },
];

const footerLinks = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Use", href: "/terms" },
  { label: "Refund Policy", href: "/refund" },
  { label: "License", href: "/license" },
  { label: "Contact", href: "/contact" },
] as const;

interface SidebarProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  useLinks?: boolean;
}

export function Sidebar({ activeCategory, onCategoryChange, collapsed, onCollapsedChange, useLinks = true }: SidebarProps) {
  const { user, loading: authLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [showCollapseTransition, setShowCollapseTransition] = useState(false);
  const visuallyCollapsed = collapsed && !hoverOpen && !mobileOpen;
  const { status: generationStatus, loading: generationStatusLoading, authenticated, error: generationError, refresh: refreshGenerations } = useGenerations();
  const guestBalance = {
    used: 0, limit: FREE_GENERATIONS_LIMIT, effective_limit: FREE_GENERATIONS_LIMIT,
    remaining: FREE_GENERATIONS_LIMIT, hasSubscription: false, plan: "none" as const,
    subscription_generations_left: FREE_GENERATIONS_LIMIT, extra_generations_left: 0,
    total_generations_left: FREE_GENERATIONS_LIMIT,
  };

  useEffect(() => {
    if (!showCollapseTransition) return;
    const timer = window.setTimeout(() => setShowCollapseTransition(false), 500);
    return () => window.clearTimeout(timer);
  }, [showCollapseTransition]);

  const CategoryItem = ({ category }: { category: (typeof categories)[0] }) => {
    const content = (
      <>
        {category.text ? (
          <span className="text-sm font-bold shrink-0">{category.text}</span>
        ) : category.icon ? (
          <category.icon className="w-5 h-5 shrink-0" />
        ) : null}
        <span
          className={cn(
            "whitespace-nowrap overflow-hidden transition-[opacity,max-width] duration-300 ease-out",
            visuallyCollapsed ? "max-w-0 opacity-0" : "max-w-[220px] opacity-100",
          )}
        >
          {category.name}
        </span>
      </>
    );

    const className = cn(
      "w-full flex items-center rounded-xl text-sm font-medium smooth",
      visuallyCollapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3",
      (activeCategory === category.name || (category.name === "Home" && activeCategory === "All"))
        ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25"
        : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
    );

    if (useLinks) {
      return (
        <Link
          href={category.href}
          title={visuallyCollapsed ? category.name : undefined}
          className={className}
          onClick={() => {
            if (category.name === "Home") onCategoryChange("All");
            setMobileOpen(false);
          }}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        type="button"
        onClick={() => {
          onCategoryChange(category.name === "Home" ? "All" : category.name);
          setMobileOpen(false);
        }}
        title={visuallyCollapsed ? category.name : undefined}
        className={className}
      >
        {content}
      </button>
    );
  };

  const sidebarContent = (
    <>
      <div
        className="group/sidebar-header relative flex h-[84px] w-full shrink-0 items-center justify-between gap-0 px-3 lg:px-4"
      >
        {useLinks ? (
          <Link
            href="/"
            className={cn(
              "group flex min-w-0 items-center",
              visuallyCollapsed ? "justify-center gap-0" : "min-w-0 flex-1 gap-3 pr-10",
            )}
            onClick={() => setMobileOpen(false)}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center smooth group-hover:scale-105">
              <Image
                src="/images/logo.png"
                alt="Motion Flow"
                width={36}
                height={36}
                className={cn(
                  "h-full w-full object-contain invert transition-opacity duration-300 dark:invert-0",
                  visuallyCollapsed && showCollapseTransition && "lg:opacity-0",
                )}
              />
            </div>
            <span
              className={cn(
                "overflow-hidden whitespace-nowrap font-semibold text-lg tracking-tight text-foreground transition-[opacity,max-width] duration-300 ease-out",
                visuallyCollapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100",
              )}
            >
              Motion Flow
            </span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onCategoryChange("All")}
            className={cn(
              "group flex min-w-0 items-center",
              visuallyCollapsed ? "justify-center gap-0" : "min-w-0 flex-1 gap-3 pr-10",
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center smooth group-hover:scale-105">
              <Image
                src="/images/logo.png"
                alt="Motion Flow"
                width={36}
                height={36}
                className={cn(
                  "h-full w-full object-contain invert transition-opacity duration-300 dark:invert-0",
                  visuallyCollapsed && showCollapseTransition && "lg:opacity-0",
                )}
              />
            </div>
            <span
              className={cn(
                "overflow-hidden whitespace-nowrap font-semibold text-lg tracking-tight text-foreground transition-[opacity,max-width] duration-300 ease-out",
                visuallyCollapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100",
              )}
            >
              Motion Flow
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setHoverOpen(false);
            if (!collapsed) setShowCollapseTransition(true);
            onCollapsedChange(!collapsed);
          }}
          className={cn(
            "absolute top-1/2 hidden h-8 w-8 -translate-y-1/2 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-all duration-300 hover:text-foreground lg:flex",
            visuallyCollapsed
              ? "left-[18px] opacity-0 focus-visible:opacity-100"
              : "left-[calc(100%-48px)] opacity-100",
            visuallyCollapsed && showCollapseTransition && "opacity-100",
          )}
          aria-label={collapsed ? "Pin sidebar open" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        <div className="mb-6">
          <ul className="space-y-1">
            {categories.map((category) => (
              <li key={category.name}>
                <CategoryItem category={category} />
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 border-t border-border/50 pt-5 lg:hidden">
          <h3 className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            More
          </h3>
          <ul className="space-y-1">
            <li>
              <Link
                href="/pricing"
                className="flex w-full items-center rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground smooth hover:bg-foreground/5 hover:text-foreground"
                onClick={() => setMobileOpen(false)}
              >
                Pricing
              </Link>
            </li>
            {MAIN_HEADER_AUTHORS_LINKS.map(({ label, href }) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground smooth hover:bg-foreground/5 hover:text-foreground"
                  onClick={() => setMobileOpen(false)}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <h3 className="mb-3 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Info
          </h3>
          <ul className="space-y-1">
            {footerLinks.map(({ label, href }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="flex w-full items-center rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground smooth hover:bg-foreground/5 hover:text-foreground"
                  onClick={() => setMobileOpen(false)}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 px-4 text-[11px] text-muted-foreground/70">
            {new Date().getFullYear()} Motion Flow. All rights reserved.
          </p>
        </div>
      </nav>

      {!authLoading && (!user || authenticated) && <div className={cn("w-full shrink-0 pb-4 transition-[padding] duration-300 ease-in-out motion-reduce:transition-none", visuallyCollapsed ? "px-2" : "px-6")}><SidebarGenerationBalance status={user ? generationStatus : guestBalance} loading={user ? generationStatusLoading : false} error={user ? generationError : null} guest={!user} collapsed={visuallyCollapsed} onRetry={() => void refreshGenerations()} onNavigate={() => setMobileOpen(false)} /></div>}
    </>
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "fixed top-[calc(0.75rem+var(--marketplace-sale-height,0px))] left-4 lg:hidden bg-background/95 backdrop-blur-sm border border-blue-500/30 shadow-lg h-10 w-10",
          /* Below aside (z-70) when open so the drawer covers the control; above audio drawer (z-60) when closed */
          mobileOpen ? "z-50" : "z-65",
        )}
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-65 lg:hidden"
          onClick={() => setMobileOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setMobileOpen(false)}
          role="button"
          tabIndex={0}
          aria-label="Close menu"
        />
      )}

      <aside
        onPointerEnter={(event) => {
          if (collapsed && event.pointerType === "mouse" && window.matchMedia("(min-width: 1024px)").matches) {
            setHoverOpen(true);
          }
        }}
        onPointerLeave={() => setHoverOpen(false)}
        className={cn(
          "fixed top-[var(--marketplace-sale-height,0px)] bottom-0 left-0 z-70 bg-background/80 backdrop-blur-xl border-r border-border/50 flex flex-col transition-all duration-300 lg:translate-x-0",
          visuallyCollapsed ? "w-[72px]" : "w-72",
          hoverOpen && collapsed ? "lg:z-60" : "lg:z-40",
          mobileOpen ? "translate-x-0 w-72" : "-translate-x-full",
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
