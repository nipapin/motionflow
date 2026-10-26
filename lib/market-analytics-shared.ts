export const MARKET_ACTIONS = ["view", "select", "favorite", "download", "purchase", "generation", "extension"] as const;
export type MarketAction = typeof MARKET_ACTIONS[number];
export const MARKET_ACTION_LABELS: Record<MarketAction, string> = {
  view: "Views", select: "Selections", favorite: "Saved", download: "Downloads",
  purchase: "Purchases", generation: "AI tools", extension: "Extension activity",
};
export type MarketFilters = { from: string; to: string; action?: MarketAction; source?: "web" | "extension" | "unknown"; scope?: "market" | "extensions" | "ai"; resourceType?: string; resourceId?: string; search?: string; page: number; sort?: string };
export type MarketResource = { type: string; id: string; name: string; views: number; selections: number; favorites: number; downloads: number; purchases: number; generations: number; extensions: number; users: number; lastAt: string };
export type MarketEvent = { id: string; action: MarketAction; detail: string; status: string; resourceType: string; resourceId: string | null; resourceName: string; userId: number | null; userName: string | null; userEmail: string | null; source: string; at: string };
export type MarketOverview = {
  totals: Record<MarketAction, number> & { users: number; failures: number };
  daily: ({ day: string } & Record<MarketAction, number>)[];
  resources: MarketResource[]; resourceTotal: number;
  events: MarketEvent[]; eventTotal: number; page: number; pageSize: number;
  users: { id: number | null; name: string; email: string | null; actions: number; downloads: number; purchases: number; lastAt: string }[];
  unavailableSources: string[];
};
export const HEAT_KINDS = ["click", "move", "dwell"] as const;
export type HeatKind = typeof HEAT_KINDS[number];
export type HeatCell = { x: number; y: number; kind: HeatKind; weight: number };
export type HeatPage = { path: string; width: number; layout: string; visits: number; firstAt: string; lastAt: string };
export type HeatReport = { pages: HeatPage[]; selected: HeatPage | null; cells: HeatCell[]; visits: number; scroll: { depth: number; visits: number }[] };
export function analyticsPublicPath(path: string): boolean {
  return /^(?:\/(?:after-effects|premiere-pro|davinci-resolve|stock-audio|sound-fx|footages|illustrator|pricing|ai-tools|image-edit|image-generation|video-generation|svg-generation|speech-to-text|text-to-speech|premiere-gal|spunkram)?|\/item\/[1-9]\d{0,9}|\/spunkram\/item\/[1-9]\d{0,9})$/.test(path);
}
export function heatWidth(width: number): number { return Math.max(320, Math.min(2560, Math.round(width / 80) * 80)); }
