import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { odinAiStatus, resolveOdinAiUser, type OdinAiUser } from "@/lib/odin-ai";
import { odinAiOperationContext } from "@/lib/odin-ai-context";

const SCHEMA = `CREATE TABLE IF NOT EXISTS odin_ai_operations (
  user_id VARCHAR(133) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  operation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  period_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tool VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  cost INT UNSIGNED NOT NULL,
  response_body MEDIUMTEXT NOT NULL,
  http_status SMALLINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,operation_id)
) ENGINE=InnoDB`;
let schemaReady: Promise<void> | undefined;
async function ensureSchema() {
  if (!schemaReady) schemaReady = getPool().query(SCHEMA).then(() => undefined).catch(error => {
    schemaReady = undefined; throw error;
  });
  await schemaReady;
}

/** Multipart boundaries and JSON property ordering are not part of a job's identity. */
export async function odinAiPayloadHash(payload: FormData | unknown): Promise<string> {
  const hash = createHash("sha256");
  if (payload instanceof FormData) {
    const entries = [...payload.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [key, value] of entries) {
      hash.update(JSON.stringify(key));
      if (typeof value === "string") hash.update(JSON.stringify(value));
      else { hash.update(JSON.stringify([value.name, value.type, value.size])); hash.update(Buffer.from(await value.arrayBuffer())); }
    }
  } else {
    hash.update(JSON.stringify(payload, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value) ?? "null");
  }
  return hash.digest("hex");
}

type CachedOperation = RowDataPacket & { period_id: string; tool: string; request_hash: string; response_body: string; http_status: number };
const errorResponse = (code: string, status: number) => Response.json({ code, error: code }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Serialize an Odin account across workers before contacting a paid provider.
 * The successful response and debit commit together. Failed/cancelled work charges zero.
 * Other clients retain their own existing generation service.
 */
export async function withOdinAiOperation(
  request: { headers: Headers; signal: AbortSignal },
  user: { source: string }, tool: string, payload: unknown, work: () => Promise<Response>,
): Promise<Response> {
  if (user.source !== "odin-bearer") return work();
  const odin = user as OdinAiUser;
  const bodyId = payload instanceof FormData ? payload.get("operationId")
    : payload && typeof payload === "object" && "operationId" in payload ? payload.operationId : undefined;
  const operationId = request.headers.get("idempotency-key") ?? (typeof bodyId === "string" ? bodyId : randomUUID());
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(operationId)) return errorResponse("INVALID_OPERATION_ID", 400);
  const initial = await odinAiStatus(odin);
  if (!initial.period_id) return errorResponse("GENERATION_LIMIT_REACHED", 402);
  const fingerprint = await odinAiPayloadHash(payload);
  await ensureSchema();
  const conn = await getPool().getConnection();
  const lockName = createHash("sha256").update(`odin-ai:${odin.id}`).digest("hex");
  let locked = false;
  try {
    const [locks] = await conn.execute<(RowDataPacket & { acquired: number })[]>("SELECT GET_LOCK(?, 0) AS acquired", [lockName]);
    locked = Number(locks[0]?.acquired) === 1;
    if (!locked) return errorResponse("OPERATION_IN_PROGRESS", 409);
    const [cached] = await conn.execute<CachedOperation[]>(
      "SELECT period_id,tool,request_hash,response_body,http_status FROM odin_ai_operations WHERE user_id=? AND operation_id=?",
      [odin.id, operationId],
    );
    if (cached[0]) {
      if (cached[0].period_id !== initial.period_id || cached[0].tool !== tool || cached[0].request_hash !== fingerprint) {
        return errorResponse("OPERATION_ID_CONFLICT", 409);
      }
      const payload = JSON.parse(cached[0].response_body);
      if (payload && typeof payload === "object" && "generations" in payload) payload.generations = await odinAiStatus(odin);
      return new Response(JSON.stringify(payload), { status: cached[0].http_status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Idempotency-Key": operationId, "Idempotency-Replayed": "true" } });
    }
    const context = { userId: odin.id, periodId: initial.period_id, operationId, amount: 0 };
    const response = await odinAiOperationContext.run(context, work);
    if (!response.ok || request.signal.aborted) return request.signal.aborted ? errorResponse("GENERATION_CANCELLED", 499) : response;
    const body = await response.clone().text();
    if (Buffer.byteLength(body, "utf8") > 16_000_000) throw new Error("Generation result too large to commit safely");
    // Refunds, expiry and revocation during a long provider call take effect before delivery.
    const authorization = request.headers.get("authorization");
    const current = authorization ? await resolveOdinAiUser(authorization) : null;
    if (!current) return errorResponse("UNAUTHORIZED", 401);
    const status = await odinAiStatus(current);
    if (current.id !== odin.id || status.period_id !== initial.period_id) return errorResponse("QUOTA_PERIOD_CHANGED", 409);
    request.signal.throwIfAborted();
    await conn.beginTransaction();
    try {
      await conn.execute("INSERT INTO odin_ai_period_usage(user_id,period_id) VALUES(?,?) ON DUPLICATE KEY UPDATE used=used", [odin.id, initial.period_id]);
      const [rows] = await conn.execute<(RowDataPacket & { used: number })[]>(
        "SELECT used FROM odin_ai_period_usage WHERE user_id=? AND period_id=? FOR UPDATE", [odin.id, initial.period_id],
      );
      if (Number(rows[0].used) + context.amount > status.limit || Date.parse(current.odinAi.period_end ?? "") <= Date.now()) {
        await conn.rollback();
        return errorResponse("GENERATION_LIMIT_REACHED", 402);
      }
      await conn.execute("UPDATE odin_ai_period_usage SET used=used+? WHERE user_id=? AND period_id=?",
        [context.amount, odin.id, initial.period_id]);
      await conn.execute(`INSERT INTO odin_ai_operations(user_id,operation_id,period_id,tool,request_hash,cost,response_body,http_status)
        VALUES(?,?,?,?,?,?,?,?)`, [odin.id,operationId,initial.period_id,tool,fingerprint,context.amount,body,response.status]);
      request.signal.throwIfAborted();
      await conn.commit();
    } catch (error) { await conn.rollback(); throw error; }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store"); headers.set("Idempotency-Key", operationId);
    return new Response(body, { status: response.status, headers });
  } catch (error) {
    if (request.signal.aborted) return errorResponse("GENERATION_CANCELLED", 499);
    throw error;
  } finally {
    if (locked) {
      try { await conn.execute("SELECT RELEASE_LOCK(?)", [lockName]); }
      catch { conn.destroy(); }
    }
    conn.release();
  }
}
