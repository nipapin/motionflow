import mysql from "mysql2/promise";
import { readDefaultPaddleEnvironment } from "../../lib/paddle-accounting/config.mjs";

export async function readCliPaddleEnvironment() {
  const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE } = process.env;
  if (!DB_HOST || !DB_USERNAME || DB_PASSWORD === undefined || !DB_DATABASE) {
    return await readDefaultPaddleEnvironment() ?? "sandbox";
  }
  const db = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT ?? 3306),
    user: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_DATABASE,
  });
  try {
    return await readDefaultPaddleEnvironment(db) ?? "sandbox";
  } finally {
    await db.end();
  }
}
