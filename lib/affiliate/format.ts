/** Formatting shared by the admin Partners pages and the partner cabinet. */

export function affiliateMoney(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Dates are shown in UTC so they line up with the payout periods. */
export function affiliateDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function affiliateRecurringLabel(mode: "first_only" | "all"): string {
  return mode === "all" ? "Every payment" : "First payment only";
}

/** Campaign suffix, or "Default" for the bare `?ref={slug}` link. */
export function affiliateSourceLabel(
  campaign: string | null | undefined,
  status?: string,
): string {
  const source = campaign?.trim() || "Default";
  if (status === "reversed") return `${source} · Refund`;
  return source;
}
