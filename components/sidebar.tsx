"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import Image from "next/image";
import {
  Music,
  Menu,
  X,
  Wand2,
  Video,
  MessageSquare,
  AudioLines,
  PanelLeftClose,
  PanelLeftOpen,
  Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const categories = [
  { name: "After Effects", text: "Ae", href: "/after-effects" },
  { name: "Premiere Pro", text: "Pr", href: "/premiere-pro" },
  { name: "DaVinci Resolve", text: "Dr", href: "/davinci-resolve" },
  { name: "Illustrator", text: "Ai", href: "/illustrator" },
  { name: "Stock Music", icon: Music, href: "/stock-music" },
  { name: "Sound FX", icon: AudioLines, href: "/sound-fx" },
];

const aiTools = [
  { name: "Image Gen", icon: Wand2, href: "/image-generation" },
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

export function Sidebar({ activeCategory, onCategoryChange, collapsed, onCollapsedChange, useLinks = false }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const CategoryItem = ({ category }: { category: typeof categories[0] }) => {
    const content = (
      <>
        {category.text ? (
          <span className="text-sm font-bold shrink-0">{category.text}</span>
        ) : category.icon ? (
          <category.icon className="w-5 h-5 shrink-0" />
        ) : null}
        <span className={cn(
          "whitespace-nowrap transition-all duration-300 overflow-hidden",
          collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
        )}>{category.name}</span>
      </>
    );

    const className = cn(
      "w-full flex items-center rounded-xl text-sm font-medium smooth",
      collapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3",
      activeCategory === category.name
        ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25"
        : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
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

  const AIToolItem = ({ tool }: { tool: typeof aiTools[0] }) => {
    const content = (
      <>
        <tool.icon className="w-5 h-5 shrink-0" />
        <span className={cn(
          "whitespace-nowrap transition-all duration-300 overflow-hidden",
          collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
        )}>{tool.name}</span>
      </>
    );

    const className = cn(
      "w-full flex items-center rounded-xl text-sm font-medium smooth",
      collapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3",
      activeCategory === tool.name
        ? "bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-lg shadow-purple-500/25"
        : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
    );

    if (useLinks) {
      return (
        <Link
          href={tool.href}
          title={collapsed ? tool.name : undefined}
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
      <div className={cn("p-6 flex items-center", collapsed ? "justify-center px-3" : "justify-between")}>
        {useLinks ? (
          <Link
            href="/"
            className="flex items-center gap-3 group overflow-hidden"
            onClick={() => setMobileOpen(false)}
          >
            <div className="w-9 h-9 flex items-center justify-center shrink-0 smooth group-hover:scale-105">
              <Image src="/images/logo.png" alt="Motion Flow" width={36} height={36} className="w-full h-full object-contain dark:invert-0 invert" />
            </div>
            <span className={cn(
              "font-semibold text-lg text-foreground tracking-tight whitespace-nowrap transition-all duration-300",
              collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
            )}>Motion Flow</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onCategoryChange("All")}
            className="flex items-center gap-3 group overflow-hidden"
          >
            <div className="w-9 h-9 flex items-center justify-center shrink-0 smooth group-hover:scale-105">
              <Image src="/images/logo.png" alt="Motion Flow" width={36} height={36} className="w-full h-full object-contain dark:invert-0 invert" />
            </div>
            <span className={cn(
              "font-semibold text-lg text-foreground tracking-tight whitespace-nowrap transition-all duration-300",
              collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
            )}>Motion Flow</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onCollapsedChange(true)}
          className={cn(
            "text-muted-foreground hover:text-foreground transition-all duration-300 hidden lg:block",
            collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
          )}
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="w-5 h-5" />
        </button>
      </div>

      {collapsed && (
        <div className="flex justify-center px-3 pb-2">
          <button
            type="button"
            onClick={() => onCollapsedChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="w-5 h-5" />
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-4">
        <div className="mb-6">
          <h3 className={cn(
            "text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-3 whitespace-nowrap transition-all duration-300 overflow-hidden",
            collapsed ? "opacity-0 h-0 mb-0" : "opacity-100 h-auto"
          )}>
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
          <div className={cn(
            "transition-all duration-300 overflow-hidden",
            collapsed ? "h-0 opacity-0" : "h-auto opacity-100"
          )}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-3 whitespace-nowrap">
              AI Tools
            </h3>
          </div>
          <div className={cn(
            "border-t border-border transition-all duration-300",
            collapsed ? "my-3 opacity-100" : "my-0 opacity-0 h-0"
          )} />
          <ul className="space-y-1">
            {aiTools.map((tool) => (
              <li key={tool.name}>
                <AIToolItem tool={tool} />
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className={cn(
        "p-4 transition-all duration-300 overflow-hidden",
        collapsed ? "opacity-0 h-0 p-0" : "opacity-100"
      )}>
        <div className="rounded-2xl p-5 bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-cyan-500/10 border border-blue-500/20">
          <h4 className="font-semibold text-foreground mb-1.5 tracking-tight whitespace-nowrap">Go Unlimited</h4>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Unlimited downloads, all templates
          </p>
          <Button className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl h-10 font-medium smooth hover-lift shadow-lg shadow-blue-500/25">
            Upgrade Now
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-[60] lg:hidden bg-background/95 backdrop-blur-sm border border-blue-500/30 shadow-lg h-10 w-10"
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
          mobileOpen ? "translate-x-0 w-72" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
