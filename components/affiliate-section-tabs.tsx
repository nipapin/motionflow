import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { AffiliateTab } from "@/lib/affiliate/tabs";

interface AffiliateSectionTabsProps {
  tabs: readonly AffiliateTab[];
  activeHref: string;
}

export function AffiliateSectionTabs({ tabs, activeHref }: AffiliateSectionTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Button
          key={tab.href}
          size="sm"
          variant={tab.href === activeHref ? "default" : "outline"}
          asChild
        >
          <Link href={tab.href}>{tab.label}</Link>
        </Button>
      ))}
    </div>
  );
}
