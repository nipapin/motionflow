"use client";

import Link from "next/link";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CreatorAiGateVariant = "subscribe" | "upgrade";

interface CreatorAiGateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: CreatorAiGateVariant;
}

export function CreatorAiGateModal({
  open,
  onOpenChange,
  variant,
}: CreatorAiGateModalProps) {
  if (!open) return null;

  const title =
    variant === "subscribe"
      ? "Create with Creator + AI"
      : "Step up to Creator + AI";

  const description =
    variant === "subscribe"
      ? "Move to Creator + AI and bring your ideas to life—images, video, and AI tools with a monthly generation allowance. We'd love to have you create with us."
      : "You're already on board. When you're ready, add Creator + AI to unlock AI image, video, and related features—your creativity, amplified.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="relative w-full max-w-md mx-4 bg-card/95 backdrop-blur-xl rounded-2xl border border-blue-500/20 p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl" />
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground smooth rounded-lg hover:bg-foreground/5"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative text-center">
          <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-blue-600 to-blue-500 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/30">
            <Sparkles className="w-8 h-8 text-white" />
          </div>

          <h2 className="text-2xl font-semibold text-foreground mb-3 tracking-tight">
            {title}
          </h2>
          <p className="text-muted-foreground mb-8 leading-relaxed">{description}</p>

          <Button
            asChild
            className="w-full bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl h-12 font-medium smooth shadow-lg shadow-blue-500/25"
          >
            <Link href="/pricing#creator-ai" onClick={() => onOpenChange(false)}>
              See Creator + AI plans
            </Link>
          </Button>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mt-4 text-sm text-muted-foreground hover:text-foreground smooth"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
