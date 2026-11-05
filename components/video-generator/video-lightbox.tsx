"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CircularLoader } from "@/components/ui/circular-loader";
import { downloadUrlAsFile } from "@/lib/download-url-as-file";
import { replicateFileUrlToDisplaySrc } from "@/lib/replicate-file-display-url";
import { MediaLightbox } from "@/components/generations/lightbox";

interface VideoLightboxProps {
  videoUrl: string;
  onClose: () => void;
}

export function VideoLightbox({ videoUrl, onClose }: VideoLightboxProps) {
  const displayUrl = replicateFileUrlToDisplaySrc(videoUrl);
  const [downloadLoading, setDownloadLoading] = useState(false);

  return (
    <MediaLightbox title="Video preview" onClose={onClose} className="w-full max-w-5xl">
      <div className="relative rounded-2xl overflow-hidden border border-blue-500/30 bg-black">
        <video
          src={displayUrl}
          controls
          controlsList="nodownload"
          playsInline
          autoPlay
          className="w-full max-h-[80vh] object-contain"
        />
      </div>
      <div className="flex justify-center mt-4">
        <Button
          type="button"
          disabled={downloadLoading}
          className="bg-white text-black hover:bg-white/90 rounded-xl shadow-lg disabled:opacity-60"
          onClick={() =>
            void downloadUrlAsFile(displayUrl, "motionflow-video", {
              onLoadingChange: setDownloadLoading,
            })
          }
        >
          {downloadLoading ? (
            <CircularLoader className="w-4 h-4 mr-2 text-black" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          Download Video
        </Button>
      </div>
    </MediaLightbox>
  );
}
