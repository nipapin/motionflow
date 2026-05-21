"use client";

import type { LucideIcon } from "lucide-react";
import {
  AudioLines,
  ChevronDown,
  Film,
  ImageIcon,
  MessageSquare,
  Mic,
  Music,
  Video,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { motionflowMainSiteUrl } from "@/lib/motionflow-urls";
import { cn } from "@/lib/utils";

type HeaderNavItem =
  | { label: string; href: string; text: string }
  | { label: string; href: string; icon: LucideIcon };

const STOCK_ASSETS_ITEMS: HeaderNavItem[] = [
  { label: "After Effects", href: "/after-effects", text: "Ae" },
  { label: "Premiere Pro", href: "/premiere-pro", text: "Pr" },
  { label: "DaVinci Resolve", href: "/davinci-resolve", text: "Dr" },
  // { label: "Illustrator", href: "/illustrator", text: "Ai" },
  { label: "Stock Music", href: "/stock-audio", icon: Music },
  { label: "Sound FX", href: "/sound-fx", icon: AudioLines },
  { label: "Footages", href: "/footages", icon: Film },
];

const AI_TOOLS_ITEMS: HeaderNavItem[] = [
  { label: "Image Gen", href: "/image-generation", icon: ImageIcon },
  { label: "Image Edit", href: "/image-edit", icon: Wand2 },
  { label: "Video Gen", href: "/video-generation", icon: Video },
  { label: "Text to Speech", href: "/text-to-speech", icon: MessageSquare },
  { label: "Speech to Text", href: "/speech-to-text", icon: Mic },
];

function ItemGlyph({ item }: { item: HeaderNavItem }) {
  if ("text" in item) {
    return (
      <span className="w-5 shrink-0 text-center text-sm font-bold text-[rgb(var(--muted))] transition-colors group-hover/item:text-white">
        {item.text}
      </span>
    );
  }
  const Icon = item.icon;
  return (
    <Icon
      className="h-5 w-5 shrink-0 text-[rgb(var(--muted))] transition-colors group-hover/item:text-white"
      aria-hidden
    />
  );
}

function NavHoverMenu({
  title,
  items,
}: {
  title: string;
  items: HeaderNavItem[];
}) {
  return (
    <HoverCard openDelay={80} closeDelay={120}>
      <HoverCardTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-9 gap-1 rounded-full px-3 text-sm font-medium text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        >
          {title}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        sideOffset={8}
        className={cn(
          "w-64 max-h-[min(70vh,420px)] overflow-y-auto border-border/40 p-2 shadow-xl sm:w-72",
          "outline-none ring-0 ring-offset-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0",
        )}
      >
        <ul className="flex flex-col gap-0.5" role="list">
          {items.map((item) => (
            <li key={item.href}>
              <a
                href={motionflowMainSiteUrl(item.href)}
                className={cn(
                  "group/item flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150",
                  "text-foreground/90 hover:text-white",
                  "hover:bg-linear-to-r hover:from-blue-500/35 hover:to-brand-500/28",
                  "hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/80",
                )}
              >
                <ItemGlyph item={item} />
                <span className="min-w-0 font-medium">{item.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}

export function AuthorHeaderNavPopovers() {
  return (
    <nav
      className="flex min-w-0 flex-wrap items-center gap-0.5 sm:gap-1"
      aria-label="Browse Motion Flow"
    >
      <NavHoverMenu title="Stock Assets" items={STOCK_ASSETS_ITEMS} />
      <NavHoverMenu title="AI Tools" items={AI_TOOLS_ITEMS} />
    </nav>
  );
}
