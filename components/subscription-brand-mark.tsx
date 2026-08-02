"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

export function SubscriptionBrandMark({
  icon,
  alt,
  invertIcon,
}: {
  icon: string | null | undefined;
  alt: string;
  invertIcon: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const src = typeof icon === "string" ? icon.trim() : "";

  if (!src || broken) {
    return (
      <Sparkles
        className="h-8 w-8 text-muted-foreground"
        aria-hidden
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={40}
      height={40}
      className={`h-10 w-10 object-contain${invertIcon ? " dark:invert" : ""}`}
      onError={() => setBroken(true)}
    />
  );
}
