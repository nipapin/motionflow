import "server-only";
import mysql from "mysql2/promise";

const globalPool = globalThis as unknown as {
  __mysqlPool?: mysql.Pool;
  __mysqlPoolKey?: string;
};

function stripEnvQuotes(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const t = value.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function poolConfigKey(): string {
  return [
    process.env.DB_HOST,
    process.env.DB_PORT ?? "3306",
    process.env.DB_USERNAME,
    stripEnvQuotes(process.env.DB_PASSWORD),
    process.env.DB_DATABASE,
  ].join("|");
}

function isTransientDbError(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  return (
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "ECONNRESET" ||
    code === "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR" ||
    code === "ETIMEDOUT"
  );
}

export function getPool(): mysql.Pool {
  const key = poolConfigKey();

  if (globalPool.__mysqlPool && globalPool.__mysqlPoolKey !== key) {
    void globalPool.__mysqlPool.end();
    globalPool.__mysqlPool = undefined;
    globalPool.__mysqlPoolKey = undefined;
  }

  if (!globalPool.__mysqlPool) {
    const host = process.env.DB_HOST;
    const user = process.env.DB_USERNAME;
    const password = stripEnvQuotes(process.env.DB_PASSWORD);
    const database = process.env.DB_DATABASE;
    if (!host || !user || password === undefined || !database) {
      throw new Error("DB_HOST, DB_USERNAME, DB_PASSWORD, and DB_DATABASE must be set");
    }
    const pool = mysql.createPool({
      host,
      port: Number(process.env.DB_PORT ?? 3306),
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      // Drop idle sockets before MySQL wait_timeout kills them server-side.
      maxIdle: 5,
      idleTimeout: 60_000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
    pool.on("connection", (conn) => {
      conn.on("error", (err) => {
        if (isTransientDbError(err)) {
          console.warn("[mysql] connection error (will discard)", err.code);
        } else {
          console.error("[mysql] connection error", err);
        }
      });
    });
    globalPool.__mysqlPool = pool;
    globalPool.__mysqlPoolKey = key;
  }
  return globalPool.__mysqlPool;
}

/** One retry for stale pooled connections after idle / server close. */
export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTransientDbError(err)) throw err;
    console.warn("[mysql] transient error, retrying once", (err as { code?: string }).code);
    return await fn();
  }
}

/** @deprecated Use getPool — alias for existing marketplace code */
export const getMysqlPool = getPool;
