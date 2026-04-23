/**
 * Starts a catalog item download in a new tab.
 * Must run in the same turn as a user gesture (click) so the browser does not block the tab.
 */
export function openMarketplaceDownload(itemId: number): void {
  const url = `/api/download/${itemId}`;
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
