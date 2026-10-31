/** node --env-file=.env --env-file=.env.local scripts/apply-cep-author-permissions-migration.mjs */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

const authorIds = [6, 1691, 4141, 900000001];
const defaultEmails = ["basepackagehelp@gmail.com", "admin@mail.ru", "ivanionee@yandex.ru"];
const legacyEmails = [...new Set([
  ...defaultEmails, ...(process.env.SPUNKRAM_BETA_EMAILS || "").split(","),
].map(email => email.trim().toLowerCase()).filter(Boolean))];

/** Resolve legacy Odin grants through its trusted account service, never by guessed ids. */
async function legacyOdinAccounts() {
  const origin = process.env.ODIN_MANAGEMENT_ORIGIN?.trim();
  const secret = process.env.ODIN_MANAGEMENT_SECRET;
  if (!origin || !secret) {
    console.log("Odin legacy grants were not imported: management integration is not configured.");
    return [];
  }
  const base = new URL(origin);
  if (secret.length < 32 || base.username || base.password ||
      (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname)))) {
    throw new Error("ODIN_NOT_CONFIGURED");
  }
  const accounts = await Promise.all(legacyEmails.map(async email => {
    const url = new URL("/api/integrations/motionflow/users", base);
    url.searchParams.set("q", email);
    url.searchParams.set("page", "1");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` }, redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("ODIN_LEGACY_IMPORT_UNAVAILABLE");
    const data = await response.json();
    if (!Array.isArray(data.users)) throw new Error("ODIN_LEGACY_IMPORT_INVALID_RESPONSE");
    const matches = data.users.filter(user => typeof user.email === "string" && user.email.trim().toLowerCase() === email);
    if (matches.length > 1) throw new Error("ODIN_LEGACY_IMPORT_AMBIGUOUS_IDENTITY");
    if (!matches.length) return null;
    const id = String(matches[0].id);
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(id)) throw new Error("ODIN_LEGACY_IMPORT_INVALID_IDENTITY");
    return id;
  }));
  return accounts.filter(Boolean);
}

let connection;
try {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_DATABASE;
  if (!host || !user || password === undefined || !database) throw new Error("DB_NOT_CONFIGURED");
  const odinAccounts = await legacyOdinAccounts();
  connection = await mysql.createConnection({
    host, user, password, database, port: Number(process.env.DB_PORT || 3306),
    connectTimeout: 10000, multipleStatements: true,
  });
  await connection.query(readFileSync(new URL("../db/migrations/2026_10_31_cep_author_permissions.sql", import.meta.url), "utf8"));
  await connection.beginTransaction();
  try {
    // Import the old server env list once; it no longer authorizes requests at runtime.
    for (const email of legacyEmails.filter(email => !defaultEmails.includes(email))) {
      for (const authorId of authorIds) {
        await connection.execute(
          `INSERT IGNORE INTO cep_author_permissions (author_id, identity_provider, subject_id, permission)
           SELECT ?, 'motionflow', CAST(id AS CHAR), 'admin' FROM users WHERE LOWER(TRIM(email)) = ?`,
          [authorId, email],
        );
      }
    }
    for (const subjectId of odinAccounts) {
      await connection.execute(
        `INSERT IGNORE INTO cep_author_permissions (author_id, identity_provider, subject_id, permission)
         VALUES (?, 'odin', ?, 'admin')`,
        [900000001, subjectId],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
  console.log(`Applied CEP author permissions migration; imported ${odinAccounts.length} legacy Odin identities.`);
} catch (error) {
  // Never print connection parameters, integration secrets or account records.
  console.error("CEP permissions migration failed:", error.code || error.cause?.code || error.message);
  process.exitCode = 1;
} finally {
  await connection?.end();
}
