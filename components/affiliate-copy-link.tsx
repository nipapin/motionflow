"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AffiliateCopyLinkProps {
  link: string;
  /** Compact variant for table cells. */
  compact?: boolean;
  className?: string;
}

export function AffiliateCopyLink({ link, compact, className }: AffiliateCopyLinkProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Referral link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select the link and copy manually");
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <code
        className={cn(
          "min-w-0 truncate rounded-md border border-blue-500/20 bg-card/60 px-2 py-1 font-mono text-xs text-foreground/90",
          compact ? "max-w-[220px]" : "flex-1",
        )}
        title={link}
      >
        {link}
      </code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void copy()}
        aria-label="Copy referral link"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {compact ? null : <span className="ml-1.5">Copy</span>}
      </Button>
    </div>
  );
}
