"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Music, Menu, X, Wand2, Pencil, Video, MessageSquare, AudioLines, PanelLeftClose, PanelLeftOpen, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGenerations } from "@/hooks/use-generations";

const categories = [
  { name: "After Effects", text: "Ae", href: "/after-effects" },
  { name: "Premiere Pro", text: "Pr", href: "/premiere-pro" },
  { name: "DaVinci Resolve", text: "Dr", href: "/davinci-resolve" },
  { name: "Illustrator", text: "Ai", href: "/illustrator" },
  { name: "Stock Music", icon: Music, href: "/stock-audio" },
  { name: "Sound FX", icon: AudioLines, href: "/sound-fx" },
];

const aiTools = [
  { name: "Image Gen", icon: Wand2, href: "/image-generation" },
  { name: "Image Edit", icon: Pencil, href: "/image-edit" },
  { name: "Video Gen", icon: Video, href: "/video-generation" },
  { name: "Text to Speech", icon: MessageSquare, href: "/text-to-speech" },
  { name: "Speech to Text", icon: Mic, href: "/speech-to-text" },
];

interface SidebarProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  useLinks?: boolean;
}

export function Sidebar({ activeCategory, onCategoryChange, collapsed, onCollapsedChange, useLinks = true }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showUpgradeBlock, setShowUpgradeBlock] = useState(!collapsed);
  const hasCollapsedOnce = useRef(false);
  const { status: generationStatus } = useGenerations();
  const hideUpgradeForPlan = generationStatus?.plan === "creator_ai";

  useEffect(() => {
    if (collapsed) {
      setShowUpgradeBlock(false);
      hasCollapsedOnce.current = true;
      return;
    }
    const delayMs = hasCollapsedOnce.current ? 300 : 0;
    const id = window.setTimeout(() => setShowUpgradeBlock(true), delayMs);
    return () => window.clearTimeout(id);
  }, [collapsed]);

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
            collapsed ? "max-w-0 opacity-0" : "max-w-[220px] opacity-100",
          )}
        >
          {category.name}
        </span>
      </>
    );

    const className = cn(
      "w-full flex items-center rounded-xl text-sm font-medium smooth",
      collapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3",
      activeCategory === category.name
        ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25"
        : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
    );

    if (useLinks) {
      return (
        <Link
          href={category.href}
          title={collapsed ? category.name : undefined}
          className={className}
          onClick={() => setMobileOpen(false)}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        type="button"
        onClick={() => {
          onCategoryChange(category.name);
          setMobileOpen(false);
        }}
        title={collapsed ? category.name : undefined}
        className={className}
      >
        {content}
      </button>
    );
  };

  const AIToolItem = ({ tool }: { tool: (typeof aiTools)[0] }) => {
    const content = (
      <>
        <tool.icon className="w-5 h-5 shrink-0" />
        <span
          className={cn(
            "whitespace-nowrap overflow-hidden transition-[opacity,max-width] duration-300 ease-out",
            collapsed ? "max-w-0 opacity-0" : "max-w-[220px] opacity-100",
          )}
        >
          {tool.name}
        </span>
      </>
    );

    const className = cn(
      "w-full flex items-center rounded-xl text-sm font-medium smooth",
      collapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3",
      activeCategory === tool.name
        ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25"
        : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
    );

    if (useLinks) {
      return (
        <Link href={tool.href} title={collapsed ? tool.name : undefined} className={className} onClick={() => setMobileOpen(false)}>
          {content}
        </Link>
      );
    }

    return (
      <button
        type="button"
        onClick={() => {
          onCategoryChange(tool.name);
          setMobileOpen(false);
        }}
        title={collapsed ? tool.name : undefined}
        className={className}
      >
        {content}
      </button>
    );
  };

  const sidebarContent = (
    <>
      <div
        className={cn(
          "relative flex w-full gap-0 px-3 lg:px-4",
          collapsed
            ? "flex-col items-center gap-2 py-5 lg:py-6"
            : "min-h-[72px] flex-row items-center justify-between py-6",
        )}
      >
        {useLinks ? (
          <Link
            href="/"
            className={cn(
              "group flex min-w-0 items-center",
              collapsed ? "justify-center gap-0" : "min-w-0 flex-1 gap-3",
            )}
            onClick={() => setMobileOpen(false)}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center smooth group-hover:scale-105">
              <Image
                src="/images/logo.png"
                alt="Motion Flow"
                width={36}
                height={36}
                className="h-full w-full object-contain invert dark:invert-0"
              />
            </div>
            <span
              className={cn(
                "overflow-hidden whitespace-nowrap font-semibold text-lg tracking-tight text-foreground transition-[opacity,max-width] duration-300 ease-out",
                collapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100",
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
              collapsed ? "justify-center gap-0" : "min-w-0 flex-1 gap-3",
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center smooth group-hover:scale-105">
              <Image
                src="/images/logo.png"
                alt="Motion Flow"
                width={36}
                height={36}
                className="h-full w-full object-contain invert dark:invert-0"
              />
            </div>
            <span
              className={cn(
                "overflow-hidden whitespace-nowrap font-semibold text-lg tracking-tight text-foreground transition-[opacity,max-width] duration-300 ease-out",
                collapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100",
              )}
            >
              Motion Flow
            </span>
          </button>
        )}
        <div
          className={cn(
            "relative hidden h-8 w-8 shrink-0 lg:block",
            "transition-opacity duration-300 ease-out",
          )}
        >
          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-md text-muted-foreground transition-opacity duration-300 hover:text-foreground",
              collapsed ? "pointer-events-none opacity-0" : "opacity-100",
            )}
            aria-label="Collapse sidebar"
            tabIndex={collapsed ? -1 : 0}
          >
            <PanelLeftClose className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onCollapsedChange(false)}
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-md text-muted-foreground transition-opacity duration-300 hover:text-foreground",
              collapsed ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            aria-label="Expand sidebar"
            tabIndex={collapsed ? 0 : -1}
          >
            <PanelLeftOpen className="h-5 w-5" />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        <div className="mb-6">
          <h3
            className={cn(
              "px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-opacity duration-300",
              collapsed ? "mb-0 h-0 overflow-hidden opacity-0" : "mb-3 opacity-100",
            )}
          >
            Categories
          </h3>
          <ul className="space-y-1">
            {categories.map((category) => (
              <li key={category.name}>
                <CategoryItem category={category} />
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-6">
          <h3
            className={cn(
              "px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-opacity duration-300",
              collapsed ? "mb-0 h-0 overflow-hidden opacity-0" : "mb-3 opacity-100",
            )}
          >
            AI Tools
          </h3>
          <ul className="space-y-1">
            {aiTools.map((tool) => (
              <li key={tool.name}>
                <AIToolItem tool={tool} />
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {showUpgradeBlock && !hideUpgradeForPlan && (
        <div className="shrink-0 w-full min-w-0 p-4">
          <div className="w-full rounded-2xl border border-blue-500/20 bg-linear-to-br from-blue-500/10 via-purple-500/5 to-cyan-500/10 p-5 animate-in fade-in-0 duration-300">
            <h4 className="mb-1.5 whitespace-nowrap font-semibold tracking-tight text-foreground">Go Unlimited</h4>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">Unlimited downloads, all templates</p>
            <Button
              asChild
              className="h-10 w-full cursor-pointer rounded-xl bg-linear-to-r from-blue-600 to-blue-500 font-medium text-white shadow-lg shadow-blue-500/25 smooth hover-lift hover:from-blue-500 hover:to-blue-400"
            >
              <Link href="/pricing">Upgrade Now</Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-60 lg:hidden bg-background/95 backdrop-blur-sm border border-blue-500/30 shadow-lg h-10 w-10"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setMobileOpen(false)}
          role="button"
          tabIndex={0}
          aria-label="Close menu"
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen bg-background/80 backdrop-blur-xl border-r border-border/50 flex flex-col transition-all duration-300 lg:translate-x-0",
          collapsed ? "w-[72px]" : "w-72",
          mobileOpen ? "translate-x-0 w-72" : "-translate-x-full",
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
