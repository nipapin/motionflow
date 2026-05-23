/** Same rules as `lib/market-items.ts` — table name from env, SQL-injection safe. */
export function marketplaceItemsTable(): string {
  const raw = process.env.DB_MARKET_ITEMS_TABLE ?? "marketplace_items";
  return /^[a-zA-Z0-9_]+$/.test(raw) ? raw : "marketplace_items";
}
