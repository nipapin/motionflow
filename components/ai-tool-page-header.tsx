"use client";

import { GenerationsBadge } from "@/components/generations-badge";
import { cn } from "@/lib/utils";
import type { GenerationStatus } from "@/hooks/use-generations";

export interface AiToolPageHeaderProps {
  title: string;
  description: string;
  descriptionClassName?: string;
  status: GenerationStatus | null;
  loading: boolean;
  authenticated: boolean;
  error?: string | null;
}

/**
 * Shared hero for AI tool pages: title + description grouped on the left, quota badge top-right.
 */
export function AiToolPageHeader({
  title,
  description,
  descriptionClassName,
  status,
  loading,
  authenticated,
  error,
}: AiToolPageHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pr-1 sm:pr-2">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight leading-tight">
            {title}
          </h1>
          <p
            className={cn(
              "mt-1.5 sm:mt-2 text-sm sm:text-base text-muted-foreground",
              descriptionClassName,
            )}
          >
            {description}
          </p>
        </div>
        <GenerationsBadge
          status={status}
          loading={loading}
          authenticated={authenticated}
          error={error}
        />
      </div>
    </div>
  );
}
