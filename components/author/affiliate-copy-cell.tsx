"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface AffiliateCopyCellProps {
  text: string;
}

export function AffiliateCopyCell({ text }: AffiliateCopyCellProps) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      toast.success("Copied");
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <div className="flex max-w-[260px] items-center gap-2">
      <span className="truncate text-sm font-medium text-primary">{text}</span>
      <Button type="button" size="sm" variant="outline" onClick={copy}>
        {done ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
