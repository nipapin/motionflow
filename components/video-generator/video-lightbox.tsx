"use client";

import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoLightboxProps {
  videoUrl: string;
  onClose: () => void;
}

export function VideoLightbox({ videoUrl, onClose }: VideoLightboxProps) {
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
            src={videoUrl}
            controls
            playsInline
            autoPlay
            className="w-full max-h-[80vh] object-contain"
          />
        </div>
        <div className="flex justify-center mt-4">
          <Button
            className="bg-white text-black hover:bg-white/90 rounded-xl shadow-lg"
            asChild
          >
            <a href={videoUrl} download target="_blank" rel="noreferrer">
              <Download className="w-4 h-4 mr-2" />
              Download Video
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
