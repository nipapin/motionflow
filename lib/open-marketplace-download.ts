"use client";

/**
 * Full navigation to the download route so the server can **303** to a presigned R2 URL
 * (or stream via the motionflow fallback). Avoids `fetch` + blob memory for large zips.
 * Auth / subscription redirects (`/?signin=1`, `/pricing`) happen in the browser as normal navigations.
 */
export function startMarketplaceDownload(itemId: number): void {
  window.setTimeout(() => {
    window.location.assign(`/api/download/${itemId}`);
  }, 350);
}

export const openMarketplaceDownload = startMarketplaceDownload;
