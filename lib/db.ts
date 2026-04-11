import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;

function stripEnvQuotes(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const t = value.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

export function getPool(): mysql.Pool {
  if (!pool) {
    const host = process.env.DB_HOST;
    const user = process.env.DB_USERNAME;
    const password = stripEnvQuotes(process.env.DB_PASSWORD);
    const database = process.env.DB_DATABASE;
    if (!host || !user || password === undefined || !database) {
      throw new Error("DB_HOST, DB_USERNAME, DB_PASSWORD, and DB_DATABASE must be set");
    }
    pool = mysql.createPool({
      host,
      port: Number(process.env.DB_PORT ?? 3306),
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}

/** @deprecated Use getPool — alias for existing marketplace code */
export const getMysqlPool = getPool;
