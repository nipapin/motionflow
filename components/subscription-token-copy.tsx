"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

function formatTokenPreview(id: string): string {
  if (id.length <= 28) return id;
  return `${id.slice(0, 16)} \u2026 ${id.slice(-4)}`;
}

interface SubscriptionTokenCopyProps {
  subscriptionId: string;
}

export function SubscriptionTokenCopy({ subscriptionId }: SubscriptionTokenCopyProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(subscriptionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 min-w-0">
      <span className="truncate font-mono text-xs font-semibold text-muted-foreground sm:text-[0.8125rem]">
        {formatTokenPreview(subscriptionId)}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground smooth hover:bg-primary/10 hover:text-primary"
        aria-label="Copy subscription token to clipboard"
      >
        {copied ? (
          <Check className="h-4 w-4 text-emerald-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
