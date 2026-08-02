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
        className="h-10 w-10 text-muted-foreground"
        aria-hidden
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={64}
      height={64}
      className={`h-16 w-16 object-contain${invertIcon ? " dark:invert" : ""}`}
      onError={() => setBroken(true)}
    />
  );
}
