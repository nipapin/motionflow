import { toast } from "sonner";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
};

function normalizeMime(raw: string | null): string {
  if (!raw) return "";
  return raw.split(";")[0].trim().toLowerCase();
}

function hasLikelyExtension(filename: string): boolean {
  const base = filename.split("/").pop() ?? filename;
  return /\.[a-z0-9]{2,8}$/i.test(base);
}

function proxiedGenerationDownloadUrl(remoteUrl: string, filename: string): string {
  const u = new URL("/api/download-generation-asset", window.location.origin);
  u.searchParams.set("url", remoteUrl);
  u.searchParams.set("name", filename);
  return u.toString();
}

function isAbsoluteHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isDownloadProxyRequest(fetchUrl: string): boolean {
  try {
    const path = new URL(fetchUrl, window.location.origin).pathname;
    return path === "/api/download-generation-asset";
  } catch {
    return false;
  }
}

/** Ordered list of URLs to try (same-origin proxy first for absolute URLs when logged-in users need to bypass CORS). */
function collectFetchUrls(url: string, filename: string): string[] {
  if (url.startsWith("/")) {
    return [url];
  }
  if (isAbsoluteHttpUrl(url)) {
    return [proxiedGenerationDownloadUrl(url, filename), url];
  }
  return [url];
}

function applyBlobDownload(blob: Blob, res: Response, filename: string): void {
  const mime = normalizeMime(blob.type || res.headers.get("content-type"));
  let name = filename;
  if (!hasLikelyExtension(name)) {
    const ext = MIME_TO_EXT[mime] ?? "";
    name = ext ? `${name}${ext}` : `${name}.bin`;
  }
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

/**
 * Save a URL as a local file. Uses a same-origin proxy when needed so CDN
 * `fetch` is not blocked by CORS. Does not open a new browser tab.
 */
export async function downloadUrlAsFile(
  url: string,
  filename: string,
): Promise<void> {
  let lastStatus: number | undefined;

  for (const fetchUrl of collectFetchUrls(url, filename)) {
    try {
      const res = await fetch(fetchUrl);
      if (!res.ok) {
        lastStatus = res.status;
        if (isDownloadProxyRequest(fetchUrl) && res.status === 401) {
          toast.error("Sign in to download.");
          return;
        }
        continue;
      }
      const blob = await res.blob();
      applyBlobDownload(blob, res, filename);
      return;
    } catch {
      /* try next */
    }
  }

  toast.error("Could not download the file. Please try again.");
}
