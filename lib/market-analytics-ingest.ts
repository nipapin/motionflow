import "server-only";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { ensureMarketAnalyticsSchema } from "@/lib/market-analytics-schema";
import { analyticsPublicPath, heatWidth, HEAT_KINDS } from "@/lib/market-analytics-shared";

export const telemetryBatchSchema = z.object({
  id: z.string().uuid(), visit: z.string().uuid(), path: z.string().max(191).refine(analyticsPublicPath),
  width: z.number().int().min(240).max(7680), layout: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/),
  heat: z.boolean(), scroll: z.number().int().min(0).max(100),
  cells: z.array(z.object({ x: z.number().int().min(0).max(39), y: z.number().int().min(0).max(199),
    kind: z.enum(HEAT_KINDS), weight: z.number().int().positive().max(15000) }).strict()).max(192),
  events: z.array(z.object({ id: z.string().uuid(), action: z.enum(["view", "select"]),
    itemId: z.number().int().positive().max(2147483647).optional() }).strict()).max(16),
}).strict();
export type TelemetryBatch = z.infer<typeof telemetryBatchSchema>;

export async function ingestTelemetry(batch: TelemetryBatch, userId: number | null): Promise<void> {
  await ensureMarketAnalyticsSchema();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [dedupe] = await connection.execute<ResultSetHeader>("INSERT IGNORE INTO market_heatmap_batches (id) VALUES (?)", [batch.id]);
    if (!dedupe.affectedRows) { await connection.rollback(); return; }
    if (batch.events.length) {
      const params: (string | number | null)[] = [];
      for (const event of batch.events) params.push(event.id, userId, batch.visit, event.action,
        event.itemId ? "marketplace_item" : "page", event.itemId ? String(event.itemId) : batch.path, batch.path);
      await connection.execute(`INSERT IGNORE INTO market_events
        (id, user_id, visit_id, action, resource_type, resource_id, path) VALUES ${batch.events.map(() => "(?,?,?,?,?,?,?)").join(",")}`, params);
    }
    if (batch.heat) {
      const width = heatWidth(batch.width);
      await connection.execute(`INSERT INTO market_heatmap_visits (id,day,path,viewport_width,layout,max_scroll) VALUES (?,CURRENT_DATE,?,?,?,?)
        ON DUPLICATE KEY UPDATE max_scroll=GREATEST(max_scroll,VALUES(max_scroll)), updated_at=NOW()`,
      [batch.visit, batch.path, width, batch.layout, batch.scroll]);
      const [visits] = await connection.execute<(RowDataPacket & { path: string; viewport_width: number; layout: string })[]>(
        "SELECT path,viewport_width,layout FROM market_heatmap_visits WHERE id=? AND day=CURRENT_DATE", [batch.visit]);
      const visit = visits[0];
      if (visit.path !== batch.path || Number(visit.viewport_width) !== width || visit.layout !== batch.layout) {
        throw new Error("Heatmap visit context changed");
      }
      if (batch.cells.length) {
        const params: (string | number)[] = [];
        for (const cell of batch.cells) params.push(batch.path, width, batch.layout, cell.kind, cell.x, cell.y,
          Math.min(cell.weight, cell.kind === "dwell" ? 15000 : 64));
        await connection.execute(`INSERT INTO market_heatmap_cells (day,path,viewport_width,layout,kind,x,y,weight)
          VALUES ${batch.cells.map(() => "(CURRENT_DATE,?,?,?,?,?,?,?)").join(",")}
          ON DUPLICATE KEY UPDATE weight=weight+VALUES(weight)`, params);
      }
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

let lastCleanup = 0;
export async function pruneHeatmapData(): Promise<void> {
  if (Date.now() - lastCleanup < 3600000) return;
  lastCleanup = Date.now();
  for (const [table, column, days] of [["market_heatmap_cells", "day", 90], ["market_heatmap_visits", "created_at", 90], ["market_heatmap_batches", "created_at", 7]] as const) {
    await getPool().query(`DELETE FROM ${table} WHERE ${column}<CURRENT_DATE-INTERVAL ${days} DAY LIMIT 5000`);
  }
}
