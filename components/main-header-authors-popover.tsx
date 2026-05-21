"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

export const MAIN_HEADER_AUTHORS_LINKS = [
  { label: "Premiere Gal", href: "https://premieregal.motionflow.pro" },
  { label: "Spunkram", href: "https://spunkram.motionflow.pro" },
  { label: "Enam Alamin", href: "https://enamalamin.motionflow.pro" },
] as const;

export function MainHeaderAuthorsPopover() {
  return (
    <HoverCard openDelay={80} closeDelay={120}>
      <HoverCardTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-9 gap-1 rounded-full px-3 text-sm font-medium text-muted-foreground hover:bg-foreground/5 hover:text-foreground sm:px-4"
        >
          Authors
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent
        align="end"
        sideOffset={8}
        className={cn(
          "w-64 border-border/40 p-2 shadow-xl sm:w-72",
          "outline-none ring-0 ring-offset-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0",
        )}
      >
        <ul className="flex flex-col gap-0.5" role="list">
          {MAIN_HEADER_AUTHORS_LINKS.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  "text-foreground/90 hover:text-white",
                  "hover:bg-linear-to-r hover:from-blue-500/35 hover:to-brand-500/28",
                  "hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/80",
                )}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}
