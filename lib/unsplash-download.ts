import "server-only";

const UNSPLASH_ORIGIN = "https://api.unsplash.com";

export function parseUnsplashDownloadLocation(value: unknown): URL | null {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    if (
      url.origin !== UNSPLASH_ORIGIN ||
      url.username || url.password || url.hash ||
      !/^\/photos\/[A-Za-z0-9_-]+\/download$/.test(url.pathname)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export async function trackUnsplashDownload(
  url: URL,
  accessKey = process.env.UNSPLASH_ACCESS_KEY,
): Promise<void> {
  if (!accessKey) throw new Error("Unsplash is not configured.");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      "Accept-Version": "v1",
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });

  await response.body?.cancel().catch(() => {});
  if (!response.ok) {
    throw new Error(`Unsplash download tracking failed (${response.status}).`);
  }
}
