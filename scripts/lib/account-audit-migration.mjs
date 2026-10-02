import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

export function accountAuditSql() {
  return readFileSync(new URL("../../db/migrations/2026_10_02_user_account_audit.sql", import.meta.url), "utf8");
}

/** Split the checked-in migration while keeping trigger BEGIN/END bodies intact. */
export function migrationStatements(sql) {
  let delimiter = ";";
  let current = "";
  const statements = [];
  for (const line of sql.split(/\r?\n/)) {
    const match = /^DELIMITER\s+(\S+)\s*$/.exec(line);
    if (match) {
      if (current.trim()) throw new Error("Unexpected DELIMITER inside a statement");
      delimiter = match[1];
      continue;
    }
    if (!current && (!line.trim() || line.trimStart().startsWith("--"))) continue;
    current += `${line}\n`;
    if (line.trimEnd().endsWith(delimiter)) {
      statements.push(current.trimEnd().slice(0, -delimiter.length).trim());
      current = "";
    }
  }
  if (current.trim()) throw new Error("Unterminated migration statement");
  return statements;
}

export async function auditDbConnection() {
  const password = process.env.DB_PASSWORD?.trim().replace(/^(["'])(.*)\1$/, "$2");
  if (!process.env.DB_HOST || !process.env.DB_USERNAME || password === undefined || !process.env.DB_DATABASE) {
    throw new Error("DB_HOST, DB_USERNAME, DB_PASSWORD and DB_DATABASE are required");
  }
  return mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USERNAME,
    password,
    database: process.env.DB_DATABASE,
    connectTimeout: 10000,
  });
}
