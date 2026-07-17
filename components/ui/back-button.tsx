"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-12"
    >
      <ArrowLeft className="w-4 h-4" />
      Back
    </button>
  );
}
