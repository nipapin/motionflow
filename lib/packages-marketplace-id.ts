/**
 * Parse marketplace_items.id from a numeric string or Package Page URL.
 * Last numeric path segment wins, e.g.
 * `https://motionflow.pro/item/spunkram-library-for-after-effects/1138` → 1138
 */
export function parseMarketplaceItemIdInput(
  raw: string | null | undefined,
): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }

  try {
    const url = s.includes("://") ? new URL(s) : new URL(s, "https://example.com");
    const parts = url.pathname.split("/").filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (/^\d+$/.test(parts[i]!)) {
        const n = Number(parts[i]);
        if (Number.isFinite(n) && n > 0) return Math.floor(n);
      }
    }
  } catch {
    /* fall through */
  }

  const m = s.match(/(\d+)\s*$/);
  if (m?.[1]) {
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }
  return null;
}
