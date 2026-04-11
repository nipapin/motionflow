"use client";

import { cn } from "@/lib/utils";

const footerLinks = [
  { label: "Privacy Policy", href: "#" },
  { label: "Terms of Use", href: "#" },
  { label: "Refund Policy", href: "#" },
  { label: "License", href: "#" },
  { label: "Contact", href: "#" },
] as const;

interface SiteFooterProps {
  className?: string;
  sidebarCollapsed?: boolean;
}

export function SiteFooter({ className, sidebarCollapsed }: SiteFooterProps) {
  return (
    <footer
      className={cn(
        "fixed bottom-0 right-0 left-0 z-40 border-t border-border/50 bg-background/80 backdrop-blur-xl transition-all duration-300",
        sidebarCollapsed ? "lg:left-[72px]" : "lg:left-72",
        className
      )}
    >
      <div className="flex flex-col gap-2 py-3 px-4 text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4 lg:px-6">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {footerLinks.map(({ label, href }) => (
            <a key={label} href={href} className="hover:text-foreground smooth">
              {label}
            </a>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/70 sm:shrink-0">
          2024 Motion Flow. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
