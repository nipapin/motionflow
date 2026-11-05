"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Dialog, DialogClose, DialogPanel, DialogTitle } from "@/components/ui/dialog";
import { replicateFileUrlToDisplaySrc } from "@/lib/replicate-file-display-url";
import { cn } from "@/lib/utils";

export function MediaLightbox({ title, onClose, className, children }: {
  title: string;
  onClose: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPanel
        aria-describedby={undefined}
        overlayClassName="z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
        className={cn("relative min-w-0 outline-none", className)}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogClose
          type="button"
          aria-label="Close preview"
          className="fixed top-6 right-6 p-2 text-white/70 hover:text-white smooth z-10"
        >
          <X className="w-8 h-8" />
        </DialogClose>
        {children}
      </DialogPanel>
    </Dialog>
  );
}

interface VideoLightboxProps {
  url: string;
  onClose: () => void;
}

export function VideoLightbox({ url, onClose }: VideoLightboxProps) {
  return (
    <MediaLightbox title="Video preview" onClose={onClose} className="w-full max-w-5xl">
      <div className="relative rounded-2xl overflow-hidden border border-blue-500/30 bg-black">
        <video
          src={replicateFileUrlToDisplaySrc(url)}
          controls
          controlsList="nodownload"
          playsInline
          autoPlay
          className="w-full max-h-[80vh] object-contain"
        />
      </div>
    </MediaLightbox>
  );
}

interface ImageLightboxProps {
  url: string;
  onClose: () => void;
}

export function ImageLightbox({ url, onClose }: ImageLightboxProps) {
  return (
    <MediaLightbox title="Image preview" onClose={onClose} className="max-w-4xl max-h-[85vh]">
      <img
        src={replicateFileUrlToDisplaySrc(url)}
        alt="Generated"
        className="max-w-full max-h-[85vh] object-contain rounded-2xl border border-blue-500/30"
      />
    </MediaLightbox>
  );
}
