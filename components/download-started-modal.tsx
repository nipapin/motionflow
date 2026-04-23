"use client";

import Link from "next/link";
import { X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DownloadStartedModalProps {
  open: boolean;
  itemId: number | null;
  onOpenChange: (open: boolean) => void;
}

export function DownloadStartedModal({ open, itemId, onOpenChange }: DownloadStartedModalProps) {
  const close = () => {
    onOpenChange(false);
  };

  if (!open || itemId == null) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={close}
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
          onClick={close}
          className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground smooth rounded-lg hover:bg-foreground/5"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/30">
            <CheckCircle2 className="w-8 h-8 text-white" strokeWidth={2} />
          </div>

          <h2 className="text-2xl font-semibold text-foreground mb-3 tracking-tight">Thank you for downloading</h2>

          <p className="text-muted-foreground mb-8 leading-relaxed">
            Your downloads are saved in your profile — you can open{" "}
            <Link
              href="/profile/downloads"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={close}
            >
              My downloads
            </Link>{" "}
            anytime to see what you&apos;ve grabbed.
          </p>

          <Button
            type="button"
            onClick={close}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl h-12 font-medium smooth shadow-lg shadow-blue-500/25"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
