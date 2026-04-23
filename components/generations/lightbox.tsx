"use client";

import { X } from "lucide-react";
import { replicateFileUrlToDisplaySrc } from "@/lib/replicate-file-display-url";

interface VideoLightboxProps {
  url: string;
  onClose: () => void;
}

export function VideoLightbox({ url, onClose }: VideoLightboxProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-6 right-6 p-2 text-white/70 hover:text-white smooth z-10"
      >
        <X className="w-8 h-8" />
      </button>
      <div
        className="relative w-full max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative rounded-2xl overflow-hidden border border-blue-500/30 bg-black">
          <video
            src={url}
            controls
            playsInline
            autoPlay
            className="w-full max-h-[80vh] object-contain"
          />
        </div>
      </div>
    </div>
  );
}

interface ImageLightboxProps {
  url: string;
  onClose: () => void;
}

export function ImageLightbox({ url, onClose }: ImageLightboxProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-6 right-6 p-2 text-white/70 hover:text-white smooth"
      >
        <X className="w-8 h-8" />
      </button>
      <div
        className="relative max-w-4xl max-h-[85vh] mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={replicateFileUrlToDisplaySrc(url)}
          alt="Generated"
          className="max-w-full max-h-[85vh] object-contain rounded-2xl border border-blue-500/30"
        />
      </div>
    </div>
  );
}
