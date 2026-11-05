"use client";

import Link from "next/link";
import { X, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogPanel, DialogTitle } from "@/components/ui/dialog";

interface SubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubscriptionModal({ open, onOpenChange }: SubscriptionModalProps) {
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPanel
        overlayClassName="z-110 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        className="relative w-full max-w-md mx-4 bg-card/95 backdrop-blur-xl rounded-2xl border border-blue-500/20 p-8 shadow-2xl"
      >
        {/* Background glow */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl" />
        </div>

        {/* Close button */}
        <button
          type="button"
          aria-label="Close dialog"
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground smooth rounded-lg hover:bg-foreground/5"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative text-center">
          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/30">
            <Crown className="w-8 h-8 text-white" />
          </div>

          {/* Title */}
          <DialogTitle className="text-2xl font-semibold text-foreground mb-3 tracking-tight">
            Subscription Required
          </DialogTitle>

          {/* Description */}
          <DialogDescription className="text-base text-muted-foreground mb-8 leading-relaxed">
            You don&apos;t have an active subscription. Upgrade to download unlimited templates, music, and sound effects.
          </DialogDescription>

          {/* CTA Button */}
          <Button 
            asChild
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl h-12 font-medium smooth shadow-lg shadow-blue-500/25"
          >
            <Link href="/pricing">
              View Pricing Plans
            </Link>
          </Button>

          {/* Secondary action */}
          <button
            onClick={() => onOpenChange(false)}
            className="mt-4 text-sm text-muted-foreground hover:text-foreground smooth"
          >
            Maybe later
          </button>
        </div>
      </DialogPanel>
    </Dialog>
  );
}
