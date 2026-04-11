"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FilterBarProps {
  activeCategory: string;
  sortBy: string;
  onSortChange: (sort: string) => void;
}

const softwareOptions = ["All Software", "Adobe Premiere", "Final Cut Pro", "Avid Media Composer", "DaVinci Resolve"];

export function FilterBar({ activeCategory, sortBy, onSortChange }: FilterBarProps) {
  const categoryOptions = ["All Categories", "Titles", "Transitions", "Openers", "Lower Thirds", "Logo Reveals"];
  const sortOptions = [
    { value: "popular", label: "Most Popular" },
    { value: "newest", label: "Newest First" },
    { value: "downloads", label: "Most Downloads" },
    { value: "trending", label: "Trending" },
  ];

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-2 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="border-border text-foreground hover:bg-accent bg-transparent">
              Categories
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-popover border-border">
            {categoryOptions.map((option) => (
              <DropdownMenuItem key={option} className="text-popover-foreground hover:bg-secondary">
                {option}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Sort by:</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="text-foreground hover:bg-secondary">
              {sortOptions.find(o => o.value === sortBy)?.label || "Most Popular"}
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-popover border-border" align="end">
            {sortOptions.map((option) => (
              <DropdownMenuItem 
                key={option.value} 
                onClick={() => onSortChange(option.value)}
                className="text-popover-foreground hover:bg-secondary"
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
