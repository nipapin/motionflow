"use client";

import { Film, Music, Mic2, Palette, Sparkles, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const browseCategories = [
  {
    name: "After Effects",
    label: "After Effects Templates",
    icon: Sparkles,
    gradient: "from-blue-600/30 to-blue-900/20",
    iconColor: "text-blue-400",
  },
  {
    name: "Premiere Pro",
    label: "Premiere Pro Templates",
    icon: Film,
    gradient: "from-purple-600/30 to-purple-900/20",
    iconColor: "text-purple-400",
  },
  {
    name: "DaVinci Resolve",
    label: "DaVinci Resolve Templates",
    icon: Palette,
    gradient: "from-orange-600/30 to-orange-900/20",
    iconColor: "text-orange-400",
  },
  {
    name: "Graphics",
    label: "Graphics",
    icon: ImageIcon,
    gradient: "from-emerald-600/30 to-emerald-900/20",
    iconColor: "text-emerald-400",
  },
  {
    name: "Stock Audio",
    label: "Stock Music",
    icon: Music,
    gradient: "from-primary/30 to-primary/10",
    iconColor: "text-primary",
  },
  {
    name: "Sound FX",
    label: "Sound Effects",
    icon: Mic2,
    gradient: "from-rose-600/30 to-rose-900/20",
    iconColor: "text-rose-400",
  },
];

interface CategoryBrowseProps {
  onCategoryChange: (category: string) => void;
}

export function CategoryBrowse({ onCategoryChange }: CategoryBrowseProps) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-5">Browse Categories</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {browseCategories.map((cat) => (
          <button
            key={cat.name}
            type="button"
            onClick={() => onCategoryChange(cat.name)}
            className={cn(
              "group relative flex items-center gap-5 rounded-xl px-6 py-7 border border-border bg-card",
              "hover:border-muted-foreground/30 hover:bg-accent transition-all duration-200 cursor-pointer text-left"
            )}
          >
            <div className={cn(
              "w-16 h-16 rounded-xl flex items-center justify-center bg-gradient-to-br shrink-0",
              cat.gradient
            )}>
              <cat.icon className={cn("w-8 h-8", cat.iconColor)} />
            </div>
            <span className="text-base font-semibold text-foreground group-hover:text-foreground transition-colors">
              {cat.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
