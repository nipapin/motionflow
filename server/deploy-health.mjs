import { createConnection } from "mysql2/promise";
import Redis from "ioredis";

export async function deploymentHealth() {
  let database = false, redis = false;
  let connection, client;
  try {
    connection = await createConnection({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD?.trim().replace(/^(['"])(.*)\1$/, "$2"),
      database: process.env.DB_DATABASE,
      connectTimeout: 3000,
    });
    await connection.query({ sql: "SELECT 1", timeout: 3000 });
    database = true;
  } catch { /* Readiness must not expose credentials or database errors. */ }
  finally { if (connection) await connection.end().catch(() => {}); }
  try {
    client = new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD === "null" ? undefined : process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB || 0),
      connectTimeout: 3000, commandTimeout: 3000,
      retryStrategy: () => null, maxRetriesPerRequest: 0, lazyConnect: true,
    });
    client.on("error", () => {});
    await client.connect();
    redis = await client.ping() === "PONG";
  } catch { /* Same sanitized response for every unavailable dependency. */ }
  finally { client?.disconnect(); }
  return { status: database && redis ? "ok" : "unavailable", release: process.env.RELEASE_ID || null, database, redis };
}
