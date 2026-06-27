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
    globalPool.__mysqlPool = mysql.createPool({
      host,
      port: Number(process.env.DB_PORT ?? 3306),
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
    });
    globalPool.__mysqlPoolKey = key;
  }
  return globalPool.__mysqlPool;
}

/** @deprecated Use getPool — alias for existing marketplace code */
export const getMysqlPool = getPool;
