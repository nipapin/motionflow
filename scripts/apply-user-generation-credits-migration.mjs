/**
 * Applies db/migrations/2026_05_04_user_generation_credits.sql using DB_* from env.
 * Usage (from repo root):
 *   node --env-file=.env scripts/apply-user-generation-credits-migration.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function stripQuotes(value) {
  if (value == null) return undefined;
  const t = String(value).trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

const sqlPath = path.join(
  __dirname,
  "../db/migrations/2026_05_04_user_generation_credits.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");

const host = process.env.DB_HOST;
const user = process.env.DB_USERNAME;
const password = stripQuotes(process.env.DB_PASSWORD);
const database = process.env.DB_DATABASE;
const port = Number(process.env.DB_PORT ?? 3306);

if (!host || !user || password === undefined || !database) {
  console.error(
    "Missing DB_HOST, DB_USERNAME, DB_PASSWORD, or DB_DATABASE.\n" +
      "Run: node --env-file=.env scripts/apply-user-generation-credits-migration.mjs",
  );
  process.exit(1);
}

const conn = await mysql.createConnection({
  host,
  port,
  user,
  password,
  database,
  multipleStatements: true,
});

try {
  await conn.query(sql);
  console.log("Applied:", path.basename(sqlPath));
} finally {
  await conn.end();
}
