"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MasonryGridProps<T> {
  items: T[];
  getKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  /** Tailwind `columns-*` classes per breakpoint. Override to tune density. */
  columnsClassName?: string;
  /** Tailwind `gap-*` class controls the column-gap between masonry columns. */
  gapClassName?: string;
  /** Tailwind `mb-*` class controls the vertical spacing between stacked items. */
  itemSpacingClassName?: string;
  className?: string;
}

export function MasonryGrid<T>({
  items,
  getKey,
  renderItem,
  columnsClassName = "columns-1 sm:columns-2 lg:columns-3 xl:columns-4",
  gapClassName = "gap-4",
  itemSpacingClassName = "mb-4",
  className,
}: MasonryGridProps<T>) {
  return (
    <div className={cn(columnsClassName, gapClassName, className)}>
      {items.map((item, index) => (
        <div
          key={getKey(item, index)}
          className={cn("break-inside-avoid", itemSpacingClassName)}
        >
          {renderItem(item, index)}
        </div>
      ))}
    </div>
  );
}
