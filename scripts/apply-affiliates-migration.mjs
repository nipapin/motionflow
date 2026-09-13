/**
 * Applies db/migrations/2026_09_13_affiliates.sql using DB_* from env.
 * Usage (from repo root):
 *   node --env-file=.env scripts/apply-affiliates-migration.mjs
 *
 * Safe to re-run: statements are executed one by one and "already exists"
 * errors (duplicate column / key) are reported and skipped.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALREADY_APPLIED = new Set([
  "ER_DUP_FIELDNAME",
  "ER_DUP_KEYNAME",
  "ER_TABLE_EXISTS_ERROR",
]);

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

/**
 * Split on `;`, ignoring semicolons inside string literals (COMMENT '…; …')
 * after dropping `--` comment lines. No stored procedures in this file.
 */
function statements(sql) {
  const body = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  const out = [];
  let current = "";
  let inString = false;
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (inString) {
      if (char === "'") {
        if (body[i + 1] === "'") {
          current += "''";
          i += 1;
          continue;
        }
        inString = false;
      }
      current += char;
      continue;
    }
    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }
    if (char === ";") {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);

  return out.map((s) => s.trim()).filter(Boolean);
}

const sqlPath = path.join(__dirname, "../db/migrations/2026_09_13_affiliates.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const host = process.env.DB_HOST;
const user = process.env.DB_USERNAME;
const password = stripQuotes(process.env.DB_PASSWORD);
const database = process.env.DB_DATABASE;
const port = Number(process.env.DB_PORT ?? 3306);

if (!host || !user || password === undefined || !database) {
  console.error(
    "Missing DB_HOST, DB_USERNAME, DB_PASSWORD, or DB_DATABASE.\n" +
      "Run: node --env-file=.env scripts/apply-affiliates-migration.mjs",
  );
  process.exit(1);
}

const conn = await mysql.createConnection({ host, port, user, password, database });

try {
  for (const statement of statements(sql)) {
    const label = statement.split("\n")[0].slice(0, 80);
    try {
      await conn.query(statement);
      console.log("OK      ", label);
    } catch (err) {
      if (ALREADY_APPLIED.has(err.code)) {
        console.log("SKIP    ", label, `(${err.code})`);
      } else {
        throw err;
      }
    }
  }
  console.log("Applied:", path.basename(sqlPath));
} finally {
  await conn.end();
}
