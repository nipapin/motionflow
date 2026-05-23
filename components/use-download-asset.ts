"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";

type DownloadProvider = "unsplash" | "pexels";
type DownloadKind = "image" | "video";

type DownloadOptions = {
  provider: DownloadProvider;
  kind: DownloadKind;
  id: string;
  suggestedName?: string;
};

function getFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf8Name = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8Name) return decodeURIComponent(utf8Name);
  const fallbackName = header.match(/filename="?([^"]+)"?/i)?.[1];
  return fallbackName ?? null;
}

export function useDownloadAsset() {
  const { user, openSignIn } = useAuth();
  const [isDownloading, setIsDownloading] = useState(false);

  const download = useCallback(
    async ({ provider, kind, id, suggestedName }: DownloadOptions) => {
      if (!user) {
        openSignIn("signin");
        return;
      }

      setIsDownloading(true);
      try {
        const params = new URLSearchParams({
          provider,
          kind,
          id,
        });
        const res = await fetch(`/api/stock/download?${params.toString()}`, {
          method: "GET",
          credentials: "include",
        });

        if (res.status === 401) {
          openSignIn("signin");
          return;
        }
        if (!res.ok) {
          throw new Error(`Download failed with status ${res.status}.`);
        }

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = getFilenameFromContentDisposition(res.headers.get("content-disposition"))
          ?? suggestedName
          ?? `motionflow-${provider}-${id}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
      } catch (err) {
        console.error("[download-asset] download failed", err);
        toast.error("Could not download file. Please try again.");
      } finally {
        setIsDownloading(false);
      }
    },
    [openSignIn, user],
  );

  return {
    isDownloading,
    download,
  };
}
